// =============================================================================
// js/ia-engine.js — Motor de Inteligência Comercial Embarcada
//
// Dual-Layer AI Architecture:
// 1. Camada Heurística Nativa (Offline, Instantânea e Sem Custo):
//    Analisa KPIs, tabelas e distribuições de qualquer relatório contra benchmarks
//    comerciais B2B, detectando gargalos, riscos e gerando 3 ações prioritárias.
// 2. Conector Multi-LLM (Generativa sob demanda):
//    Suporte nativo a Google Gemini, Anthropic Claude e OpenAI para resumos
//    executivos aprofundados e respostas a perguntas do usuário.
// =============================================================================

// Chaves de armazenamento local por empresa
function iaChaveStorage(nome) {
  const sufixo = typeof marcaAtiva === "function" ? marcaAtiva().sufixoStorage : "";
  return `atlas-ia-${nome}${sufixo}`;
}

const IA_CONFIG = {
  get provedor() {
    try { return localStorage.getItem(iaChaveStorage("provedor")) || "gemini"; } catch (e) { return "gemini"; }
  },
  set provedor(v) {
    try { localStorage.setItem(iaChaveStorage("provedor"), v); } catch (e) {}
  },
  getChave(provedor) {
    const prov = provedor || this.provedor;
    try {
      if (prov === "anthropic") {
        return (typeof obterChaveIASalvaV10 === "function" ? obterChaveIASalvaV10() : "") || localStorage.getItem(iaChaveStorage("chave-anthropic")) || "";
      }
      return localStorage.getItem(iaChaveStorage(`chave-${prov}`)) || "";
    } catch (e) { return ""; }
  },
  salvarChave(provedor, chave) {
    try {
      localStorage.setItem(iaChaveStorage(`chave-${provedor}`), chave.trim());
      if (provedor === "anthropic" && typeof CHAVE_IA_LOCAL !== "undefined") {
        localStorage.setItem(CHAVE_IA_LOCAL, chave.trim());
      }
    } catch (e) {}
  }
};

// -----------------------------------------------------------------------------
// CAMADA 1: Motor Heurístico de Diagnóstico Comercial (Sem dependência de API)
// -----------------------------------------------------------------------------

/**
 * Gera diagnóstico inteligente baseado nos dados calculados de um relatório do Catálogo.
 * @param {object} relatorio - { chave, titulo, subtitulo, kpis, tabelas, nota }
 * @returns {object} { pontosFortes: [], gargalos: [], acoes: [], resumo: string }
 */
function iaDiagnosticarRelatorioCatalogo(relatorio) {
  if (!relatorio || (!relatorio.kpis && !relatorio.tabelas)) {
    return null;
  }

  const kpis = relatorio.kpis || [];
  const tabelas = relatorio.tabelas || [];
  const pontosFortes = [];
  const gargalos = [];
  const acoes = [];

  // 1. Análise baseada em KPIs presentes
  kpis.forEach((kpi) => {
    const rotulo = (kpi.rotulo || "").toLowerCase();
    const valNum = parseFloat(String(kpi.valor || "").replace(/[^\d,-]/g, "").replace(",", "."));

    if (rotulo.includes("win rate") || rotulo.includes("conversão")) {
      if (!isNaN(valNum)) {
        if (valNum >= 30) {
          pontosFortes.push(`Taxa de conversão saudável em ${kpi.valor} (${kpi.rotulo}), acima da média do setor.`);
        } else if (valNum < 15 && valNum > 0) {
          gargalos.push(`Taxa de conversão baixa em ${kpi.valor} (${kpi.rotulo}) — risco de perda excessiva de oportunidades.`);
          acoes.push("Auditar os principais motivos de perda para mapear objeções recorrentes de preço/produto.");
        }
      }
    }

    if (rotulo.includes("coverage") || rotulo.includes("cobertura")) {
      if (!isNaN(valNum)) {
        if (valNum >= 3) {
          pontosFortes.push(`Cobertura de pipeline robusta (${kpi.valor}), superando a margem segura de 3.0x.`);
        } else if (valNum < 2) {
          gargalos.push(`Pipeline vulnerável com coverage de apenas ${kpi.valor} (abaixo do chão seguro de 2.0x).`);
          acoes.push("Acelerar prospecção ativa e reengajar oportunidades mornas para recompor a cobertura da meta.");
        }
      }
    }

    if (rotulo.includes("aging") || rotulo.includes("tempo") || rotulo.includes("ciclo")) {
      if (!isNaN(valNum) && valNum > 60) {
        gargalos.push(`Tempo médio de permanência alto (${kpi.valor}), sinalizando estagnação nas etapas de negociação.`);
        acoes.push("Executar saneamento de negócios parados há mais de 45 dias sem avanço de estágio.");
      }
    }

    if (rotulo.includes("no-show") || rotulo.includes("faltou")) {
      if (!isNaN(valNum) && valNum > 20) {
        gargalos.push(`Índice de No-show elevado (${kpi.valor}) reduzindo a produtividade de reuniões.`);
        acoes.push("Adotar confirmação prévia no WhatsApp 2h antes das reuniões para reduzir faltas.");
      }
    }
  });

  // 2. Análise baseada em dados tabulares
  tabelas.forEach((tab) => {
    const dados = tab.dados || [];
    if (!dados.length) return;

    if (dados[0] && (dados[0].VENDEDOR || dados[0].RESPONSAVEL)) {
      const totalGeral = dados.reduce((acc, row) => acc + (parseFloat(String(row.RECEITA || row.VALOR || row.FECHADO || 0).replace(/[^\d,-]/g, "").replace(",", ".")) || 1), 0);
      if (totalGeral > 0 && dados.length > 1) {
        const top1Val = parseFloat(String(dados[0].RECEITA || dados[0].VALOR || dados[0].FECHADO || 0).replace(/[^\d,-]/g, "").replace(",", ".")) || 0;
        const pctConcentracao = Math.round((top1Val / totalGeral) * 100);
        if (pctConcentracao > 50) {
          gargalos.push(`Alta concentração: o principal responsável detém ${pctConcentracao}% do volume do relatório.`);
          acoes.push("Planejar redistribuição de contas para evitar sobrecarga e dependência operacional.");
        }
      }
    }
  });

  if (!pontosFortes.length) {
    pontosFortes.push("Base estruturada disponível para acompanhamento e tomada de decisão.");
  }
  if (!gargalos.length) {
    pontosFortes.push("Nenhuma anomalia crítica de tempo ou dispersão detectada neste relatório.");
  }
  if (!acoes.length) {
    acoes.push("Alinhar as métricas deste relatório com a liderança para acompanhamento semanal.");
    acoes.push("Monitorar a tendência dos indicadores no fechamento da semana.");
  }

  const resumo = `${relatorio.titulo}: ${pontosFortes[0] || ""} ${gargalos[0] ? "Ponto de atenção: " + gargalos[0] : ""}`;

  return {
    pontosFortes: pontosFortes.slice(0, 3),
    gargalos: gargalos.slice(0, 3),
    acoes: acoes.slice(0, 3),
    resumo
  };
}

/**
 * Gera diagnóstico executivo inteligente para o Cockpit Comercial.
 * @param {object} c - cockpitCalcular() payload
 * @returns {object} { narrativa: string, statusGeral: string, highlights: [] }
 */
function iaDiagnosticarCockpit(c) {
  if (!c || !c.resultadoMes) return null;

  const pctMeta = c.resultadoMes.pctMeta || 0;
  const fechado = c.resultadoMes.fechadoMes || 0;
  const gap = c.resultadoMes.gapMeta || 0;
  const commit = c.forecast ? c.forecast.commit || 0 : 0;
  const fcTotal = c.forecast ? c.forecast.forecastTotal || 0 : 0;
  const coverage = c.saude && typeof c.saude.coverage === "number" ? c.saude.coverage : null;
  const winRate = c.eficiencia ? c.eficiencia.winRateMensal : null;

  let statusGeral = "neutro";
  let tomAbertura = "";

  if (pctMeta >= 100) {
    statusGeral = "otimo";
    tomAbertura = `🏆 Meta superada! O fechamento atingiu ${pctMeta}% com ${typeof moedaRelatorio === "function" ? moedaRelatorio(fechado) : "R$ " + fechado} em novos negócios.`;
  } else if (pctMeta >= 75) {
    statusGeral = "bom";
    tomAbertura = `🚀 Trajetória positiva: ${pctMeta}% da meta já foi alcançado (${typeof moedaRelatorio === "function" ? moedaRelatorio(fechado) : "R$ " + fechado}). Gap restante: ${typeof moedaRelatorio === "function" ? moedaRelatorio(gap) : "R$ " + gap}.`;
  } else if (pctMeta >= 40) {
    statusGeral = "alerta";
    tomAbertura = `⚖️ Mês em andamento: ${pctMeta}% atingido (${typeof moedaRelatorio === "function" ? moedaRelatorio(fechado) : "R$ " + fechado}). Há um gap de ${typeof moedaRelatorio === "function" ? moedaRelatorio(gap) : "R$ " + gap} a buscar.`;
  } else {
    statusGeral = "critico";
    tomAbertura = `⚠️ Atenção executiva: fechamento atual em ${pctMeta}% da meta. O ritmo de fechamento precisa acelerar.`;
  }

  const highlights = [];

  if (fcTotal >= (gap + fechado) && gap > 0) {
    highlights.push(`🔮 **Forecast favorável:** O forecast projetado de ${typeof moedaRelatorio === "function" ? moedaRelatorio(fcTotal) : "R$ " + fcTotal} é suficiente para cobrir o gap.`);
  } else if (gap > 0) {
    highlights.push(`⚠️ **Alerta de gap:** O forecast total de ${typeof moedaRelatorio === "function" ? moedaRelatorio(fcTotal) : "R$ " + fcTotal} não cobre totalmente o gap de ${typeof moedaRelatorio === "function" ? moedaRelatorio(gap) : "R$ " + gap}.`);
  }

  if (commit > 0) {
    highlights.push(`🎯 **Commit mapeado:** ${typeof moedaRelatorio === "function" ? moedaRelatorio(commit) : "R$ " + commit} em negócios com alta certeza de fechamento.`);
  }

  if (coverage !== null) {
    if (coverage >= 3.0) {
      highlights.push(`🛡️ **Pipeline saudável:** Cobertura de ${coverage.toFixed(2)}x proporciona margem confortável para a meta.`);
    } else if (coverage < 2.0) {
      highlights.push(`🚨 **Cobertura frágil:** Coverage de ${coverage.toFixed(2)}x abaixo do piso recomendado de 2.0x.`);
    }
  }

  if (winRate !== null) {
    highlights.push(`📈 **Conversão Comercial:** Win Rate registrado em ${winRate}%.`);
  }

  const recomendacoes = [];
  if (gap > 0 && commit < gap) {
    recomendacoes.push("Focar esforço de liderança em destravar os negócios de 'Best Case' com decisões pendentes.");
  } else if (gap > 0) {
    recomendacoes.push("Garantir acompanhamento diário dos negócios em 'Commit' para confirmar o fechamento dentro do mês.");
  } else {
    recomendacoes.push("Meta atingida: focar em antecipar fechamentos do próximo ciclo (pipeline M+1).");
  }

  if (coverage !== null && coverage < 2.5) {
    recomendacoes.push("Intensificar geração imediata de pipeline e qualificação de novas oportunidades.");
  } else {
    recomendacoes.push("Manter a cadência de follow-up ativa para sustentar a boa cobertura do pipeline.");
  }
  recomendacoes.push("Revisar e atualizar negócios com CLOSEDATE expirada para manter o forecast higienizado.");

  return {
    statusGeral,
    tomAbertura,
    highlights,
    recomendacoes,
    narrativa: `${tomAbertura}\n\n` + highlights.join("\n") + "\n\n**Ações Prioritárias Recomendadas:**\n" + recomendacoes.map((r, i) => `${i + 1}. ${r}`).join("\n")
  };
}

// -----------------------------------------------------------------------------
// CAMADA 2: Conector Universal Multi-LLM (Gemini, Claude, OpenAI)
// -----------------------------------------------------------------------------

async function iaEnviarMensagemLLM(prompt, contextoDados = "") {
  const provedor = IA_CONFIG.provedor;
  const chave = IA_CONFIG.getChave(provedor);

  if (!chave) {
    throw new Error(`Nenhuma chave da API configurada para o provedor "${provedor}". Adicione sua chave nas configurações de IA.`);
  }

  const systemPrompt = `Você é o Copiloto de Inteligência Comercial da ${typeof marcaAtiva === "function" ? marcaAtiva().nome : "empresa"}.
Seu objetivo é analisar dados de vendas extraídos do CRM Bitrix24, apontar riscos, oportunidades e planos práticos de ação.
Responda sempre em português do Brasil, de forma executiva, objetiva e fundamentada estritamente nos números apresentados.`;

  const promptCompleto = contextoDados
    ? `${prompt}\n\n=== DADOS EXTRAÍDOS DO BITRIX24 (JSON) ===\n${contextoDados.slice(0, 150000)}`
    : prompt;

  // 1. Google Gemini
  if (provedor === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(chave)}`;
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: promptCompleto }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.2 }
      })
    });

    const data = await resposta.json();
    if (!resposta.ok) {
      throw new Error(data?.error?.message || `Erro ${resposta.status} na API do Google Gemini.`);
    }
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) throw new Error("A API do Gemini retornou uma resposta sem conteúdo.");
    return texto.trim();
  }

  // 2. Anthropic Claude
  if (provedor === "anthropic") {
    const resposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: promptCompleto }]
      })
    });

    const data = await resposta.json();
    if (!resposta.ok) {
      throw new Error(data?.error?.message || `Erro ${resposta.status} na API da Anthropic.`);
    }
    const texto = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return texto.trim() || "Resposta vazia recebida da IA.";
  }

  // 3. OpenAI
  if (provedor === "openai") {
    const resposta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${chave}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: promptCompleto }
        ],
        temperature: 0.2,
        max_tokens: 2048
      })
    });

    const data = await resposta.json();
    if (!resposta.ok) {
      throw new Error(data?.error?.message || `Erro ${resposta.status} na API da OpenAI.`);
    }
    const texto = data?.choices?.[0]?.message?.content;
    return (texto || "").trim() || "Resposta vazia recebida da IA.";
  }

  throw new Error(`Provedor desconhecido: ${provedor}`);
}

// -----------------------------------------------------------------------------
// Componentes Visuais de IA Embarcada
// -----------------------------------------------------------------------------

function iaRenderizarCardInsightsHTML(diag) {
  if (!diag) return "";

  const fortesLi = diag.pontosFortes.map((p) => `<li><span class="ia-bullet ok">✓</span> <span>${escapeHtmlRelatorio(p)}</span></li>`).join("");
  const gargalosLi = diag.gargalos.map((g) => `<li><span class="ia-bullet alerta">!</span> <span>${escapeHtmlRelatorio(g)}</span></li>`).join("");
  const acoesLi = diag.acoes.map((a) => `<li><span class="ia-bullet acao">→</span> <span>${escapeHtmlRelatorio(a)}</span></li>`).join("");

  return `
    <div class="card ia-insights-card" style="margin: 16px 0 20px;">
      <div class="ia-insights-header">
        <div class="ia-insights-badge">
          <span class="ia-sparkle">✨</span> IA Embarcada · Diagnóstico &amp; Recomendações
        </div>
        <button type="button" class="secundario ia-btn-aprofundar" onclick="iaAbrirModalAprofundamento()" style="font-size:11.5px;padding:6px 12px;">
          🤖 Aprofundar com Copiloto IA
        </button>
      </div>

      <div class="ia-insights-grid">
        <div class="ia-insights-coluna col-pontos-fortes">
          <h4>🟢 Destaques Positivos</h4>
          <ul>${fortesLi || "<li>Nenhum ponto de destaque imediato.</li>"}</ul>
        </div>

        <div class="ia-insights-coluna col-gargalos">
          <h4>🟡 Pontos de Atenção &amp; Riscos</h4>
          <ul>${gargalosLi || "<li>Nenhum gargalo crítico detectado.</li>"}</ul>
        </div>

        <div class="ia-insights-coluna col-acoes">
          <h4>🎯 Plano de Ação Recomendado</h4>
          <ul>${acoesLi}</ul>
        </div>
      </div>
    </div>
  `;
}

function iaGarantirModalNoDOM() {
  if (typeof document === "undefined" || !document.body) return;
  if (document.getElementById("iaModalUniversal")) return;

  const modalHtml = `
    <div class="help-modal" id="iaModalUniversal" onclick="if(event.target===this)iaFecharModalUniversal()">
      <div class="help-dialog ia-dialog" role="dialog" aria-modal="true" style="width:min(720px,96%);">
        <div class="help-head ia-modal-head">
          <div>
            <div class="hero-eyebrow" style="color:var(--brand);margin-bottom:2px;">✨ Inteligência Comercial</div>
            <h3 id="iaModalTitulo" style="margin:0;">Copiloto Executivo com IA</h3>
          </div>
          <button type="button" class="help-close" onclick="iaFecharModalUniversal()">✕</button>
        </div>
        
        <div class="help-body ia-modal-body" style="padding:18px 22px;">
          <div class="ia-provedor-bar" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--surface-2);padding:10px 14px;border-radius:12px;margin-bottom:14px;border:1px solid var(--line);">
            <label style="margin:0;font-size:11.5px;font-weight:700;">Provedor:</label>
            <select id="iaModalSeletorProvedor" onchange="iaAoMudarProvedorModal(this.value)" style="width:auto;min-height:30px;padding:4px 8px;font-size:11.5px;">
              <option value="gemini">Google Gemini (Recomendado)</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="openai">OpenAI (GPT-4o)</option>
            </select>
            <span id="iaModalStatusChave" class="ia-chave-pill">Sem chave</span>
            <button type="button" class="toggle-eye" onclick="iaModalConfigurarChave()" style="font-size:11.5px;margin-left:auto;">⚙️ Configurar chave</button>
          </div>

          <div id="iaModalConfigChavePainel" class="oculto" style="background:var(--surface);padding:14px;border-radius:12px;margin-bottom:14px;border:1px solid var(--line);box-shadow:var(--shadow-card);">
            <label id="iaModalLabelChave" style="margin-top:0;">Chave da API:</label>
            <div class="row" style="gap:8px;align-items:center;">
              <input type="password" id="iaModalInputChave" placeholder="Cole sua API Key aqui..." style="flex:1;">
              <button type="button" onclick="iaModalSalvarChave()">Salvar</button>
            </div>
            <p class="rodape-nota" id="iaModalAjudaChave" style="margin-bottom:0;"></p>
          </div>

          <div id="iaModalConteudoTexto" class="ia-resumo-conteudo" style="max-height:420px;overflow-y:auto;padding-right:4px;">
            <div class="spinner" style="display:block;margin:20px auto;"></div>
            <p style="text-align:center;color:var(--ink-2);">Gerando análise executiva dos dados...</p>
          </div>

          <div class="ia-modal-pergunta-row" style="display:flex;gap:8px;margin-top:16px;align-items:center;">
            <input type="text" id="iaModalPerguntaInput" placeholder="Faça uma pergunta sobre os dados..." onkeydown="if(event.key==='Enter')iaModalPerguntar()" style="flex:1;">
            <button type="button" id="iaModalBtnPerguntar" onclick="iaModalPerguntar()">Perguntar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

function iaFecharModalUniversal() {
  const modal = document.getElementById("iaModalUniversal");
  if (modal) modal.classList.remove("aberto");
}

function iaAtualizarStatusPillModal() {
  const prov = IA_CONFIG.provedor;
  const sel = document.getElementById("iaModalSeletorProvedor");
  if (sel) sel.value = prov;
  const pill = document.getElementById("iaModalStatusChave");
  if (!pill) return;
  const chave = IA_CONFIG.getChave(prov);
  if (chave) {
    pill.textContent = `Chave ${prov} salva`;
    pill.style.background = "color-mix(in srgb, var(--ok) 14%, transparent)";
    pill.style.color = "var(--ok)";
    pill.style.padding = "3px 8px";
    pill.style.borderRadius = "999px";
    pill.style.fontSize = "11px";
    pill.style.fontWeight = "700";
  } else {
    pill.textContent = `Sem chave ${prov}`;
    pill.style.background = "var(--surface-2)";
    pill.style.color = "var(--ink-2)";
    pill.style.padding = "3px 8px";
    pill.style.borderRadius = "999px";
    pill.style.fontSize = "11px";
    pill.style.fontWeight = "600";
  }
}

function iaAoMudarProvedorModal(novoProv) {
  IA_CONFIG.provedor = novoProv;
  iaAtualizarStatusPillModal();
  const painel = document.getElementById("iaModalConfigChavePainel");
  if (painel && !painel.classList.contains("oculto")) {
    iaModalConfigurarChave();
  }
}

function iaModalConfigurarChave() {
  const painel = document.getElementById("iaModalConfigChavePainel");
  if (!painel) return;
  painel.classList.toggle("oculto");
  if (painel.classList.contains("oculto")) return;

  const prov = IA_CONFIG.provedor;
  const input = document.getElementById("iaModalInputChave");
  const label = document.getElementById("iaModalLabelChave");
  const ajuda = document.getElementById("iaModalAjudaChave");

  if (input) input.value = IA_CONFIG.getChave(prov);
  if (label) label.textContent = `Chave da API (${prov.toUpperCase()}):`;
  if (ajuda) {
    if (prov === "gemini") ajuda.innerHTML = 'Obtenha gratuitamente em <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio</a>. Começa com <code>AIzaSy...</code>';
    else if (prov === "anthropic") ajuda.innerHTML = 'Obtenha no <a href="https://console.anthropic.com/" target="_blank" rel="noopener">Console da Anthropic</a>. Começa com <code>sk-ant-...</code>';
    else ajuda.innerHTML = 'Obtenha no <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">Dashboard da OpenAI</a>. Começa com <code>sk-...</code>';
  }
}

function iaModalSalvarChave() {
  const prov = IA_CONFIG.provedor;
  const input = document.getElementById("iaModalInputChave");
  const val = (input?.value || "").trim();
  if (!val) {
    alert("Digite uma chave válida.");
    return;
  }
  IA_CONFIG.salvarChave(prov, val);
  iaAtualizarStatusPillModal();
  document.getElementById("iaModalConfigChavePainel")?.classList.add("oculto");
  alert(`Chave de ${prov.toUpperCase()} salva com segurança neste navegador!`);
}

async function iaAbrirModalAprofundamento(contextoCustom, tituloCustom) {
  iaGarantirModalNoDOM();
  iaAtualizarStatusPillModal();

  const modal = document.getElementById("iaModalUniversal");
  const titulo = document.getElementById("iaModalTitulo");
  const conteudo = document.getElementById("iaModalConteudoTexto");
  if (titulo) titulo.textContent = tituloCustom || "Copiloto Comercial · Análise Inteligente";
  if (modal) modal.classList.add("aberto");

  let pacote = contextoCustom;
  if (!pacote && typeof coletarDadosParaPrompt === "function") {
    pacote = coletarDadosParaPrompt();
  }
  if (!pacote && typeof cockpitState !== "undefined" && cockpitState.ultimoCalculo) {
    pacote = { modo: "Cockpit Comercial Executivo", conteudo: cockpitState.ultimoCalculo };
  }

  let baselineHTML = "";
  if (pacote && pacote.modo && pacote.modo.includes("Cockpit") && typeof cockpitState !== "undefined" && cockpitState.ultimoCalculo) {
    const diagCockpit = iaDiagnosticarCockpit(cockpitState.ultimoCalculo.c);
    if (diagCockpit) {
      baselineHTML = `
        <div class="ia-baseline-box" style="background:var(--surface);padding:16px;border-radius:12px;border:1px solid var(--line);margin-bottom:12px;">
          <p class="ia-abertura" style="font-size:14px;margin:0 0 10px;line-height:1.5;"><strong>${escapeHtmlRelatorio(diagCockpit.tomAbertura)}</strong></p>
          <ul style="margin:0 0 12px;padding-left:20px;line-height:1.6;font-size:12.5px;">${diagCockpit.highlights.map(h => `<li>${escapeHtmlRelatorio(h).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`).join("")}</ul>
          <div style="background:var(--surface-2);padding:10px 12px;border-radius:8px;font-size:12px;">
            <strong>🎯 Recomendações da Gestão:</strong>
            <ol style="margin:6px 0 0;padding-left:18px;line-height:1.5;">${diagCockpit.recomendacoes.map(r => `<li>${escapeHtmlRelatorio(r)}</li>`).join("")}</ol>
          </div>
        </div>
      `;
    }
  } else if (typeof resultadoRelatorioCatalogo !== "undefined" && resultadoRelatorioCatalogo && resultadoRelatorioCatalogo.titulo) {
    const diagCat = iaDiagnosticarRelatorioCatalogo(resultadoRelatorioCatalogo);
    if (diagCat) {
      baselineHTML = `
        <div class="ia-baseline-box" style="background:var(--surface);padding:16px;border-radius:12px;border:1px solid var(--line);margin-bottom:12px;">
          <p class="ia-abertura" style="font-size:13.5px;margin:0 0 10px;"><strong>Diagnóstico Rápido:</strong> ${escapeHtmlRelatorio(diagCat.resumo)}</p>
          <div style="background:var(--surface-2);padding:10px 12px;border-radius:8px;font-size:12px;">
            <strong>🎯 Plano de Ação Recomendado:</strong>
            <ol style="margin:6px 0 0;padding-left:18px;line-height:1.5;">${diagCat.acoes.map(a => `<li>${escapeHtmlRelatorio(a)}</li>`).join("")}</ol>
          </div>
        </div>
      `;
    }
  }

  const prov = IA_CONFIG.provedor;
  const chave = IA_CONFIG.getChave(prov);

  if (!chave) {
    conteudo.innerHTML = baselineHTML + `
      <div class="aviso" style="margin-top:14px;border-radius:10px;">
        💡 <strong>Diagnóstico Gerado via IA Heurística Nativa</strong> (sem necessidade de chave de API).<br>
        Para análises narrativas aprofundadas e perguntas livres, configure sua chave do <strong>Google Gemini (grátis)</strong>, Claude ou OpenAI no seletor acima.
      </div>
    `;
    return;
  }

  conteudo.innerHTML = baselineHTML + `
    <div class="ia-loading-llm" style="padding:14px;background:var(--surface-2);border-radius:10px;margin-top:12px;text-align:center;font-size:12.5px;">
      <div class="spinner" style="display:inline-block;margin-right:8px;"></div> Consultando ${prov.toUpperCase()} para análise executiva em tempo real...
    </div>
  `;

  try {
    const dadosJSON = pacote ? JSON.stringify(pacote.conteudo, null, 2) : "";
    const prompt = `Analise detalhadamente este relatório/painel comercial da nossa empresa. Aponte os 3 principais riscos, 2 oportunidades de fechamento ou aceleração de vendas e sintetize um plano de ação prioritário de 3 passos para o gestor.`;
    const respostaLLM = await iaEnviarMensagemLLM(prompt, dadosJSON);

    conteudo.innerHTML = baselineHTML + `
      <div class="ia-llm-resposta" style="margin-top:14px;padding:16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;line-height:1.6;font-size:13px;white-space:pre-wrap;">
        <div style="font-size:11px;font-weight:800;color:var(--brand);margin-bottom:8px;text-transform:uppercase;">✨ Parecer Executivo do Copiloto IA (${prov.toUpperCase()}):</div>
${escapeHtmlRelatorio(respostaLLM)}
      </div>
    `;
  } catch (err) {
    conteudo.innerHTML = baselineHTML + `
      <div class="erro" style="margin-top:12px;">Falha ao conectar com a API de IA: ${escapeHtmlRelatorio(err.message)}</div>
    `;
  }
}

async function iaModalPerguntar() {
  const input = document.getElementById("iaModalPerguntaInput");
  const pergunta = (input?.value || "").trim();
  if (!pergunta) return;

  const conteudo = document.getElementById("iaModalConteudoTexto");
  const prov = IA_CONFIG.provedor;
  const chave = IA_CONFIG.getChave(prov);

  if (!chave) {
    alert(`Por favor configure sua chave da API do ${prov.toUpperCase()} para fazer perguntas interativas.`);
    iaModalConfigurarChave();
    return;
  }

  input.value = "";
  let pacote = typeof coletarDadosParaPrompt === "function" ? coletarDadosParaPrompt() : null;
  if (!pacote && typeof cockpitState !== "undefined" && cockpitState.ultimoCalculo) {
    pacote = { modo: "Cockpit Comercial Executivo", conteudo: cockpitState.ultimoCalculo };
  }
  const dadosJSON = pacote ? JSON.stringify(pacote.conteudo, null, 2) : "";

  const perguntaDiv = document.createElement("div");
  perguntaDiv.className = "v10-msg v10-msg-usuario";
  perguntaDiv.style.marginTop = "12px";
  perguntaDiv.textContent = pergunta;
  conteudo.appendChild(perguntaDiv);

  const respostaDiv = document.createElement("div");
  respostaDiv.className = "v10-msg v10-msg-ia";
  respostaDiv.style.marginTop = "8px";
  respostaDiv.innerHTML = `<span class="spinner" style="display:inline-block;margin-right:6px;"></span> Pensando...`;
  conteudo.appendChild(respostaDiv);
  conteudo.scrollTop = conteudo.scrollHeight;

  try {
    const resp = await iaEnviarMensagemLLM(pergunta, dadosJSON);
    respostaDiv.innerHTML = `<div style="font-size:10.5px;font-weight:700;color:var(--brand);margin-bottom:4px;">Copiloto IA (${prov.toUpperCase()}):</div>${escapeHtmlRelatorio(resp).replace(/\n/g, "<br>")}`;
  } catch (e) {
    respostaDiv.className = "v10-msg v10-msg-erro";
    respostaDiv.textContent = "Erro: " + e.message;
  }
  conteudo.scrollTop = conteudo.scrollHeight;
}
