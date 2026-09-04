// ---------------------------------------------------------------------------
// Temperatura do Lead — atualização em massa dos negócios do funil Comercial
// parados em "Proposta Enviada" (CATEGORY_ID=0, STAGE_ID=NEW — ver config.js).
//
// Cria (se ainda não existir) um campo personalizado de lista no Bitrix
// (crm.userfield.add, ENTITY_ID=CRM_DEAL) com 3 opções: 🔥 Quente, 🌤️ Morno,
// 🧊 Frio — e permite classificar vários negócios de uma vez, salvando tudo
// no Bitrix (crm.deal.update) com um único clique em "Salvar alterações".
//
// Escrita real no Bitrix (cria campo + atualiza negócios): só executa com
// "Habilitar escrita no Bitrix" marcado — mesmo padrão de opt-in explícito já
// usado em js/pipeline-financeiro-acompanhamento.js.
// ---------------------------------------------------------------------------

const TL_CATEGORIA_COMERCIAL = "0";
const TL_STAGE_PROPOSTA = "NEW"; // "Proposta Enviada" no funil Comercial (config.js)
const TL_FIELD_NAME = "UF_CRM_TEMPERATURA_LEAD";
const TL_FIELD_XML_ID = "TEMPERATURA_LEAD_ATLAS";
const TL_OPCOES = [
  { chave: "quente", emoji: "🔥", label: "Quente", valorBitrix: "🔥 Quente" },
  { chave: "morno", emoji: "🌤️", label: "Morno", valorBitrix: "🌤️ Morno" },
  { chave: "frio", emoji: "🧊", label: "Frio", valorBitrix: "🧊 Frio" },
];

const tlState = {
  campo: null,        // { fieldName, id, opcoes:[{chave,emoji,label,id}] } depois de confirmado no Bitrix
  deals: [],           // negócios de "Proposta Enviada" já enriquecidos
  pendentes: {},        // { dealId: chave } — escolhas ainda não salvas no Bitrix
  carregando: false,
  ultimaAtualizacao: null,
  webhookDominio: "",
  filtroTexto: "",
  filtroSemTemp: false,
};

// ---------------------------------------------------------------------------
// Campo personalizado no Bitrix (detectar / criar)
// ---------------------------------------------------------------------------

async function tlBuscarCampoExistente(webhook) {
  const body = await bitrixPostJsonComRetentativa(webhook, "crm.userfield.list", {
    filter: { "=ENTITY_ID": "CRM_DEAL", "=FIELD_NAME": TL_FIELD_NAME },
  });
  const campos = body?.result || [];
  return campos.find((f) => String(f.FIELD_NAME) === TL_FIELD_NAME) || null;
}

function tlMapearOpcoesDoCampo(campoBitrix) {
  const lista = campoBitrix?.LIST || [];
  return TL_OPCOES.map((opt) => {
    const encontrado = lista.find((item) => normalizarTextoChave(item.VALUE || "").includes(normalizarTextoChave(opt.label)));
    return { ...opt, id: encontrado ? String(encontrado.ID) : null };
  });
}

async function tlCriarCampoNoBitrix(webhook) {
  const fields = {
    ENTITY_ID: "CRM_DEAL",
    FIELD_NAME: TL_FIELD_NAME.replace(/^UF_CRM_/, ""),
    USER_TYPE_ID: "enumeration",
    XML_ID: TL_FIELD_XML_ID,
    MULTIPLE: "N",
    MANDATORY: "N",
    SHOW_FILTER: "Y",
    SHOW_IN_LIST: "Y",
    EDIT_IN_LIST: "Y",
    IS_SEARCHABLE: "N",
    EDIT_FORM_LABEL: { en: "Lead Temperature", br: "Temperatura do Lead", pt: "Temperatura do Lead" },
    LIST_COLUMN_LABEL: { en: "Temperature", br: "Temperatura", pt: "Temperatura" },
    LIST_FILTER_LABEL: { en: "Temperature", br: "Temperatura", pt: "Temperatura" },
    SETTINGS: { DISPLAY: "LIST" },
    VALUES: TL_OPCOES.map((opt, i) => ({ VALUE: opt.valorBitrix, DEF: "N", SORT: String((i + 1) * 100) })),
  };
  const body = await bitrixPostJsonComRetentativa(webhook, "crm.userfield.add", { fields });
  if (!body?.result) throw new Error('O Bitrix não retornou o ID do campo criado (crm.userfield.add). Confira se o webhook tem permissão de escrita em "CRM" (campos personalizados).');
  return body.result;
}

// `criar` = true tenta criar o campo no Bitrix se ele ainda não existir;
// false só confirma se já existe (usado no "↻ Atualizar do Bitrix" normal,
// pra não criar nada sem o usuário pedir explicitamente).
async function tlGarantirCampo(webhook, { criar }) {
  let campoBitrix = await tlBuscarCampoExistente(webhook);
  if (!campoBitrix) {
    if (!criar) return null;
    await tlCriarCampoNoBitrix(webhook);
    campoBitrix = await tlBuscarCampoExistente(webhook);
    if (!campoBitrix) throw new Error('Campo criado, mas não foi possível confirmá-lo logo em seguida (crm.userfield.list). Clique em "↻ Atualizar do Bitrix" novamente em alguns segundos.');
  }
  const opcoes = tlMapearOpcoesDoCampo(campoBitrix);
  if (opcoes.some((o) => !o.id)) {
    throw new Error(`O campo "Temperatura do Lead" já existe no Bitrix (${TL_FIELD_NAME}), mas não tem as 3 opções esperadas (🔥 Quente / 🌤️ Morno / 🧊 Frio) — confira em Configurações do CRM → Negócio → Campos personalizados, ou apague o campo pra esta ferramenta recriar do zero.`);
  }
  return { fieldName: TL_FIELD_NAME, id: campoBitrix.ID, opcoes };
}

// ---------------------------------------------------------------------------
// Busca dos negócios em "Proposta Enviada"
// ---------------------------------------------------------------------------

function tlDiasNaEtapa(d) {
  const dataRef = parteDataISO(d.MOVED_TIME) || parteDataISO(d.DATE_MODIFY) || parteDataISO(d.DATE_CREATE);
  if (!dataRef) return null;
  const dias = diferencaDiasBrutaAteReferencia(dataRef, formatarDataISO(new Date()));
  return typeof dias === "number" ? Math.max(0, dias) : null;
}

async function tlBuscarNegocios(webhook, campo) {
  const campos = ["ID", "TITLE", "STAGE_ID", "CATEGORY_ID", "OPPORTUNITY", "CURRENCY_ID", "ASSIGNED_BY_ID", "COMPANY_ID", "CONTACT_ID", "DATE_CREATE", "DATE_MODIFY", "MOVED_TIME", campo.fieldName];
  const filtro = { CATEGORY_ID: TL_CATEGORIA_COMERCIAL, STAGE_ID: TL_STAGE_PROPOSTA };
  const [meta, busca] = await Promise.all([
    buscarMetadadosFunisEEstagios(webhook),
    listarCompletoRelatorio(webhook, "crm.deal.list", campos, filtro, { ID: "ASC" }, "Temperatura do Lead: buscando negócios em Proposta Enviada..."),
  ]);
  const idsEmpresa = [...new Set(busca.dados.map((d) => d.COMPANY_ID).filter(idBitrixValido).map(idBitrixString))];
  // LOGO: campo de arquivo da empresa no CRM (opcional — nem toda empresa tem
  // um logo cadastrado no Bitrix). Quando ausente ou inválido, o avatar cai
  // pras iniciais do nome (ver tlAvatarEmpresaHTML), então nunca quebra a tela.
  const empresas = await buscarEntidadesPorIds(webhook, "crm.company.list", idsEmpresa, ["ID", "TITLE", "LOGO"]);
  const base = { meta, empresas };
  return busca.dados.map((d) => {
    const enriquecido = enriquecerDealCatalogo(d, base);
    const valorCampo = d[campo.fieldName];
    const opcaoAtual = campo.opcoes.find((o) => String(o.id) === String(valorCampo)) || null;
    const empresa = idBitrixValido(d.COMPANY_ID) ? empresas[idBitrixString(d.COMPANY_ID)] : null;
    return { ...enriquecido, _TEMPERATURA_ATUAL: opcaoAtual ? opcaoAtual.chave : null, _DIAS_ETAPA: tlDiasNaEtapa(d), _LOGO_EMPRESA: tlExtrairUrlLogo(empresa?.LOGO) };
  });
}

// O campo LOGO (tipo arquivo) do crm.company vem em formatos diferentes
// dependendo da versão/portal do Bitrix — string (URL direta), ou objeto com
// downloadUrl/urlMachine/url. Tenta as formas mais comuns; se nenhuma bater,
// o avatar cai pras iniciais (tlAvatarEmpresaHTML) em vez de quebrar.
function tlExtrairUrlLogo(valor) {
  if (!valor) return "";
  if (typeof valor === "string") return valor;
  return valor.downloadUrl || valor.urlMachine || valor.url || "";
}

// ---------------------------------------------------------------------------
// Fluxo da página: atualizar / criar campo
// ---------------------------------------------------------------------------

function tlWebhookAtual() {
  return document.getElementById("webhook")?.value.trim() || "";
}

async function tlAtualizarDoBitrix() {
  const webhook = tlWebhookAtual();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  esconderErro();
  const btn = document.getElementById("tlBtnAtualizar");
  if (btn) btn.disabled = true;
  tlState.carregando = true;
  atualizarStatus("Temperatura do Lead: verificando campo no Bitrix...");
  try {
    const campo = await tlGarantirCampo(webhook, { criar: false });
    tlState.campo = campo;
    if (campo) {
      atualizarStatus("Temperatura do Lead: buscando negócios em Proposta Enviada...");
      tlState.deals = await tlBuscarNegocios(webhook, campo);
      tlState.pendentes = {};
      tlState.ultimaAtualizacao = new Date();
      tlState.webhookDominio = extrairDominioWebhook(webhook);
      atualizarStatus(`Temperatura do Lead atualizado: ${tlState.deals.length} negócio(s) em "Proposta Enviada".`);
    } else {
      atualizarStatus('Campo "Temperatura do Lead" ainda não existe neste Bitrix — marque "Habilitar escrita no Bitrix" e clique em "🌡️ Criar campo no Bitrix" abaixo.');
    }
    tlRenderTudo();
  } catch (e) {
    mostrarErro("Não foi possível atualizar a lista.\n\nDetalhe técnico: " + e.message);
  } finally {
    tlState.carregando = false;
    if (btn) btn.disabled = false;
  }
}

async function tlCriarCampoEAtualizar() {
  if (!document.getElementById("tlHabilitarEscrita")?.checked) {
    alert('Marque "Habilitar escrita no Bitrix" (card acima) antes de criar o campo.');
    return;
  }
  const webhook = tlWebhookAtual();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  esconderErro();
  const btn = document.getElementById("tlBtnCriarCampo");
  if (btn) btn.disabled = true;
  atualizarStatus('Criando campo "Temperatura do Lead" no Bitrix...');
  try {
    tlState.campo = await tlGarantirCampo(webhook, { criar: true });
    tlRenderStatusCampo();
    atualizarStatus('Campo "Temperatura do Lead" criado no Bitrix. Clique em "↻ Atualizar do Bitrix" para carregar os negócios de "Proposta Enviada".');
  } catch (e) {
    mostrarErro('Não foi possível criar o campo no Bitrix.\n\nDetalhe técnico: ' + e.message + '\n\nConfira se o webhook de entrada tem permissão de escrita em "CRM" (inclui criação de campos personalizados).');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Seleção (individual e em massa) — só em memória até "Salvar alterações"
// ---------------------------------------------------------------------------

function tlDealsFiltrados() {
  let lista = tlState.deals;
  if (tlState.filtroSemTemp) lista = lista.filter((d) => !(tlState.pendentes[d.ID] || d._TEMPERATURA_ATUAL));
  if (tlState.filtroTexto) {
    const q = normalizarTextoChave(tlState.filtroTexto);
    lista = lista.filter((d) => normalizarTextoChave(d._CLIENTE || d.TITLE || "").includes(q));
  }
  return lista.slice().sort((a, b) => (b._DIAS_ETAPA || 0) - (a._DIAS_ETAPA || 0));
}

function tlSelecionarTemperatura(dealId, chave) {
  const deal = tlState.deals.find((d) => String(d.ID) === String(dealId));
  if (!deal) return;
  // Clicar de novo na mesma opção já selecionada desmarca a alteração
  // pendente (volta a mostrar o valor que já está salvo no Bitrix).
  const efetivoAtual = tlState.pendentes[dealId] ?? deal._TEMPERATURA_ATUAL;
  if (efetivoAtual === chave) delete tlState.pendentes[dealId];
  else tlState.pendentes[dealId] = chave;
  tlRenderCards();
  tlRenderLista();
  tlRenderBarraSalvar();
}

function tlMarcarVisiveisComo(chave) {
  // Só marca como pendente quem realmente muda — senão "N alterações
  // pendentes" conta negócios que já estavam nessa temperatura no Bitrix.
  tlDealsFiltrados().forEach((d) => {
    if (d._TEMPERATURA_ATUAL === chave) delete tlState.pendentes[d.ID];
    else tlState.pendentes[d.ID] = chave;
  });
  tlRenderCards();
  tlRenderLista();
  tlRenderBarraSalvar();
}

function tlLimparSelecao() {
  tlState.pendentes = {};
  tlRenderCards();
  tlRenderLista();
  tlRenderBarraSalvar();
}

function tlAoDigitarBusca(valor) {
  tlState.filtroTexto = valor || "";
  tlRenderLista();
}

function tlAlternarFiltroSemTemp() {
  tlState.filtroSemTemp = !!document.getElementById("tlFiltroSemTemp")?.checked;
  tlRenderLista();
}

// ---------------------------------------------------------------------------
// Salvar no Bitrix (crm.deal.update, um negócio por vez — volume típico de
// "Proposta Enviada" é baixo o suficiente pra não precisar de batch.json).
// ---------------------------------------------------------------------------

async function tlSalvarAlteracoes() {
  if (!document.getElementById("tlHabilitarEscrita")?.checked) {
    alert('Marque "Habilitar escrita no Bitrix" (card acima) antes de salvar.');
    return;
  }
  const idsAlterados = Object.keys(tlState.pendentes);
  if (!idsAlterados.length) { alert("Nenhuma alteração pendente para salvar."); return; }
  if (!tlState.campo) { mostrarErro('Campo "Temperatura do Lead" ainda não confirmado no Bitrix — clique em "↻ Atualizar do Bitrix" primeiro.'); return; }
  const webhook = tlWebhookAtual();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  esconderErro();

  const btn = document.getElementById("tlBtnSalvar");
  if (btn) btn.disabled = true;
  let ok = 0, falha = 0;
  const falhas = [];
  for (const dealId of idsAlterados) {
    const chave = tlState.pendentes[dealId];
    const opcao = tlState.campo.opcoes.find((o) => o.chave === chave);
    atualizarStatus(`Salvando temperatura no Bitrix... (${ok + falha + 1}/${idsAlterados.length})`);
    if (!opcao) { falha++; continue; }
    try {
      await bitrixPostJsonComRetentativa(webhook, "crm.deal.update", { id: dealId, fields: { [tlState.campo.fieldName]: opcao.id } });
      const deal = tlState.deals.find((d) => String(d.ID) === String(dealId));
      if (deal) deal._TEMPERATURA_ATUAL = chave;
      delete tlState.pendentes[dealId];
      ok++;
    } catch (e) {
      falha++;
      falhas.push(`#${dealId}: ${e.message}`);
    }
  }
  tlRenderTudo();
  if (btn) btn.disabled = false;
  atualizarStatus(`Temperatura salva no Bitrix: ${ok} negócio(s) atualizado(s)${falha ? `, ${falha} falharam` : ""}.`);
  if (falha) {
    mostrarErro(`${falha} negócio(s) não foram atualizados no Bitrix. Confira se o webhook tem permissão de escrita em CRM (Negócios) e tente salvar de novo.\n\n` + falhas.join("\n"));
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function tlRenderStatusCampo() {
  const el = document.getElementById("tlStatusCampo");
  if (!el) return;
  if (tlState.campo) {
    el.innerHTML = `<p class="rodape-nota" style="color:var(--ok);">✅ Campo <strong>"Temperatura do Lead"</strong> (${escapeHtmlRelatorio(tlState.campo.fieldName)}) confirmado no Bitrix, com as 3 opções esperadas.</p>`;
    document.getElementById("tlBtnCriarCampo")?.classList.add("oculto");
  } else {
    el.innerHTML = `<p class="rodape-nota cockpit-aviso-forte">⚠️ O campo "Temperatura do Lead" ainda não existe neste Bitrix (ou existe com opções diferentes das 3 esperadas). Marque "Habilitar escrita no Bitrix" e clique em "🌡️ Criar campo no Bitrix" para criá-lo.</p>`;
    document.getElementById("tlBtnCriarCampo")?.classList.remove("oculto");
  }
}

function tlContagem() {
  const cont = { quente: 0, morno: 0, frio: 0, semTemp: 0 };
  tlState.deals.forEach((d) => {
    const efetivo = tlState.pendentes[d.ID] ?? d._TEMPERATURA_ATUAL;
    if (efetivo && cont[efetivo] !== undefined) cont[efetivo]++;
    else cont.semTemp++;
  });
  return cont;
}

function tlRenderCards() {
  const el = document.getElementById("tlCards");
  if (!el) return;
  const cont = tlContagem();
  const itens = [
    { emoji: "🔥", label: "Quente", n: cont.quente },
    { emoji: "🌤️", label: "Morno", n: cont.morno },
    { emoji: "🧊", label: "Frio", n: cont.frio },
    { emoji: "⬜", label: "Sem temperatura", n: cont.semTemp },
  ];
  el.innerHTML = itens.map((c) => `<div class="cockpit-kpi tl-kpi"><span class="valor">${c.n}</span><span class="rotulo">${c.emoji} ${c.label}</span></div>`).join("");
}

function tlLinkNegocio(deal) {
  const dominio = tlState.webhookDominio || extrairDominioWebhook(tlWebhookAtual());
  return dominio ? `https://${dominio}/crm/deal/details/${encodeURIComponent(deal.ID)}/` : "";
}

// Iniciais do nome da empresa (até 2 letras: primeira + última palavra) —
// mesmo padrão do avatar de vendedor em pipeline-financeiro-acompanhamento.js.
function tlIniciaisEmpresa(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// Logo real da empresa (campo LOGO do crm.company) quando existe; cai pras
// iniciais (mesmo estilo do avatar de vendedor) quando a empresa não tem logo
// cadastrado no Bitrix ou a imagem falha ao carregar — nunca deixa buraco.
// A troca em caso de erro é feita via tlAvatarErro (DOM direto) em vez de
// montar HTML dentro do atributo onerror, pra não precisar de aspas aninhadas.
function tlAvatarEmpresaHTML(deal) {
  const nome = deal._CLIENTE || deal.TITLE || "";
  const iniciais = escapeHtmlRelatorio(tlIniciaisEmpresa(nome));
  if (deal._LOGO_EMPRESA) {
    const url = escapeHtmlRelatorio(deal._LOGO_EMPRESA);
    return `<img src="${url}" alt="" class="tl-empresa-avatar tl-empresa-avatar-img" data-iniciais="${iniciais}" onerror="tlAvatarErro(this)">`;
  }
  return `<span class="tl-empresa-avatar">${iniciais}</span>`;
}

function tlAvatarErro(img) {
  const span = document.createElement("span");
  span.className = "tl-empresa-avatar";
  span.textContent = img.dataset.iniciais || "?";
  img.replaceWith(span);
}

function tlBotaoTemperatura(deal, opt) {
  const efetivo = tlState.pendentes[deal.ID] ?? deal._TEMPERATURA_ATUAL;
  const ativo = efetivo === opt.chave;
  const pendente = Object.prototype.hasOwnProperty.call(tlState.pendentes, deal.ID) && tlState.pendentes[deal.ID] !== deal._TEMPERATURA_ATUAL && ativo;
  return `<button type="button" class="tl-temp-btn tl-temp-${opt.chave}${ativo ? " tl-temp-ativo" : ""}${pendente ? " tl-temp-pendente" : ""}" onclick="tlSelecionarTemperatura('${deal.ID}','${opt.chave}')" title="${opt.emoji} ${escapeHtmlRelatorio(opt.label)}">${opt.emoji}</button>`;
}

function tlLinhaHTML(deal) {
  const botoes = TL_OPCOES.map((o) => tlBotaoTemperatura(deal, o)).join("");
  const link = tlLinkNegocio(deal);
  return `<div class="tl-item-card" id="tlLinha_${deal.ID}">
    <div class="tl-linha-topo">
      <div class="tl-linha-empresa">
        ${tlAvatarEmpresaHTML(deal)}
        <div>
          <strong>${escapeHtmlRelatorio(deal._CLIENTE || deal.TITLE || `Negócio ${deal.ID}`)}</strong><br>
          ${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer" class="tl-link-negocio">Abrir negócio no Bitrix ↗</a>` : ""}
        </div>
      </div>
      <div class="tl-temp-grupo">${botoes}</div>
    </div>
    <div class="tl-item-stats">
      <div class="tl-mini-stat">
        <span class="tl-mini-label">Responsável</span>
        <span class="tl-mini-valor">${escapeHtmlRelatorio(deal._RESPONSAVEL || "—")}</span>
      </div>
      <div class="tl-mini-stat">
        <span class="tl-mini-label">Dias na etapa</span>
        <span class="tl-mini-valor">${deal._DIAS_ETAPA != null ? deal._DIAS_ETAPA : "—"}</span>
      </div>
      <div class="tl-mini-stat">
        <span class="tl-mini-label">Valor</span>
        <span class="tl-mini-valor">${moedaRelatorio(deal._VALOR)}</span>
      </div>
    </div>
  </div>`;
}

function tlRenderLista() {
  const cont = document.getElementById("tlLista");
  if (!cont) return;
  if (!tlState.campo) {
    cont.innerHTML = `<p class="rodape-nota">Confirme (ou crie) o campo "Temperatura do Lead" no Bitrix, no card acima, antes de listar os negócios.</p>`;
    return;
  }
  const itens = tlDealsFiltrados();
  if (!itens.length) {
    cont.innerHTML = tlState.deals.length
      ? `<p class="rodape-nota">Nenhum negócio para este filtro.</p>`
      : `<p class="rodape-nota">Nenhum negócio encontrado em "Proposta Enviada" (funil Comercial) no momento.</p>`;
    return;
  }
  cont.innerHTML = itens.map(tlLinhaHTML).join("");
}

function tlRenderBarraSalvar() {
  const el = document.getElementById("tlBarraSalvar");
  if (!el) return;
  const n = Object.keys(tlState.pendentes).length;
  const contagem = el.querySelector("#tlContagemPendente");
  const btn = el.querySelector("#tlBtnSalvar");
  if (contagem) contagem.textContent = n ? `${n} alteração(ões) pendente(s) de salvar` : "Nenhuma alteração pendente";
  if (btn) btn.disabled = !n;
}

function tlRenderStatus() {
  const el = document.getElementById("tlUltimaAtualizacao");
  if (!el) return;
  el.textContent = tlState.ultimaAtualizacao
    ? `Última atualização do Bitrix: ${tlState.ultimaAtualizacao.toLocaleString("pt-BR")}.`
    : "Ainda não atualizado nesta sessão.";
}

function tlRenderTudo() {
  tlRenderStatusCampo();
  tlRenderCards();
  tlRenderLista();
  tlRenderBarraSalvar();
  tlRenderStatus();
}

// ---------------------------------------------------------------------------
// Inicialização da página
// ---------------------------------------------------------------------------

function tlIniciarPagina() {
  if (!document.getElementById("tlCards")) return; // só roda na página dedicada
  const campoWebhook = document.getElementById("webhook");
  if (campoWebhook && typeof obterWebhookSalvo === "function") {
    const salvo = obterWebhookSalvo();
    if (salvo) campoWebhook.value = salvo;
  }
  tlRenderTudo();
}
