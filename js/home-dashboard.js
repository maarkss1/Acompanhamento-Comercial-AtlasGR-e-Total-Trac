// ---------------------------------------------------------------------------
// Home — widgets interativos (relógio analógico, calendário, animação dos
// números do dashboard, chatbot buscador de relatórios). Não duplica nenhum
// cálculo de negócio: o dashboard em si é preenchido pelo próprio
// renderizarCockpit() (js/cockpit.js) nos containers #home* já previstos lá —
// este arquivo só cuida da parte visual/interativa por cima disso.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Relógio analógico (SVG) — ponteiros via CSS transform, atualiza a cada
// segundo. Puramente decorativo/utilitário, não depende de dados do Bitrix.
// ---------------------------------------------------------------------------
function homeAtualizarRelogioAnalogico() {
  const agora = new Date();
  const h = agora.getHours() % 12, m = agora.getMinutes(), s = agora.getSeconds();
  const grauHora = h * 30 + m * 0.5;
  const grauMinuto = m * 6 + s * 0.1;
  const grauSegundo = s * 6;
  const ph = document.getElementById("homeRelogioHora");
  const pm = document.getElementById("homeRelogioMinuto");
  const ps = document.getElementById("homeRelogioSegundo");
  if (ph) ph.style.transform = `rotate(${grauHora}deg)`;
  if (pm) pm.style.transform = `rotate(${grauMinuto}deg)`;
  if (ps) ps.style.transform = `rotate(${grauSegundo}deg)`;
  const digital = document.getElementById("homeRelogioDigital");
  if (digital) digital.textContent = agora.toLocaleTimeString("pt-BR");
}

function homeIniciarRelogioAnalogico() {
  if (!document.getElementById("homeRelogioSvg")) return;
  homeAtualizarRelogioAnalogico();
  setInterval(homeAtualizarRelogioAnalogico, 1000);
}

// ---------------------------------------------------------------------------
// Calendário do mês — navegação Anterior/Próximo, hoje destacado. Também
// puramente visual/utilitário (sem fonte de eventos do Bitrix associada).
// ---------------------------------------------------------------------------
const homeCalState = { ref: new Date() };
const HOME_CAL_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const HOME_CAL_DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function homeCalRenderizar() {
  const grid = document.getElementById("homeCalGrid");
  const titulo = document.getElementById("homeCalTitulo");
  if (!grid || !titulo) return;
  const ref = homeCalState.ref;
  const ano = ref.getFullYear(), mes = ref.getMonth();
  titulo.textContent = `${HOME_CAL_MESES[mes]} ${ano}`;
  const hoje = new Date();
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const celulas = HOME_CAL_DIAS_SEMANA.map((d) => `<div class="home-cal-cabecalho">${d}</div>`);
  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(`<div class="home-cal-dia home-cal-dia-vazio"></div>`);
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const ehHoje = hoje.getFullYear() === ano && hoje.getMonth() === mes && hoje.getDate() === dia;
    celulas.push(`<div class="home-cal-dia${ehHoje ? " home-cal-dia-hoje" : ""}">${dia}</div>`);
  }
  grid.innerHTML = celulas.join("");
}

function homeCalMudarMes(delta) {
  homeCalState.ref = new Date(homeCalState.ref.getFullYear(), homeCalState.ref.getMonth() + delta, 1);
  homeCalRenderizar();
}

function homeCalHoje() {
  homeCalState.ref = new Date();
  homeCalRenderizar();
}

// ---------------------------------------------------------------------------
// Animação dos números do dashboard: quando um valor de KPI muda (inclusive
// na primeira vez que aparece), conta do valor anterior até o novo em vez de
// trocar de texto seco — e a barrinha embaixo do card "oscila" de cor
// enquanto conta, assentando na cor final quando o número certo é atingido.
// Observa os containers via MutationObserver — funciona pra qualquer KPI que
// renderizarCockpit() escrever neles, sem precisar listar cada um.
// ---------------------------------------------------------------------------
const HOME_DASHBOARD_CONTAINERS = ["homeResultadoMes", "homeForecast", "homeSaudePipeline", "homeWinRate", "homeEficiencia"];

function homeExtrairPartesNumero(texto) {
  const m = String(texto || "").trim().match(/^([^\d]*)([\d.,]+)(.*)$/);
  if (!m) return null;
  const [, prefixo, numTexto, sufixo] = m;
  const temVirgula = numTexto.includes(",");
  const decimais = temVirgula ? (numTexto.split(",")[1] || "").length : 0;
  const normalizado = temVirgula ? numTexto.replace(/\./g, "").replace(",", ".") : numTexto.replace(/\./g, "");
  const valor = parseFloat(normalizado);
  if (!Number.isFinite(valor)) return null;
  return { prefixo, sufixo, decimais, valor };
}

function homeAnimarValor(el) {
  const textoFinal = el.textContent;
  const partes = homeExtrairPartesNumero(textoFinal);
  if (!partes) return; // "não disponível", "—" etc. — deixa como está
  if (el.dataset.homeAnimando === "1") return;
  const anteriorTexto = el.dataset.homeUltimoTexto;
  if (anteriorTexto === textoFinal) return; // já é o valor mostrado, nada a animar
  const anterior = homeExtrairPartesNumero(anteriorTexto || "");
  const inicio = anterior ? anterior.valor : 0;
  const alvo = partes.valor;
  el.dataset.homeAnimando = "1";
  el.classList.add("home-valor-animando");
  const card = el.closest(".cockpit-kpi");
  if (card) card.classList.add("home-kpi-oscilando");
  const t0 = performance.now();
  const duracao = 700;
  function passo(agora) {
    const p = Math.min(1, (agora - t0) / duracao);
    const facilitado = 1 - Math.pow(1 - p, 3);
    const atual = inicio + (alvo - inicio) * facilitado;
    el.textContent = partes.prefixo + atual.toLocaleString("pt-BR", { minimumFractionDigits: partes.decimais, maximumFractionDigits: partes.decimais }) + partes.sufixo;
    if (p < 1) {
      requestAnimationFrame(passo);
    } else {
      el.textContent = textoFinal;
      el.dataset.homeUltimoTexto = textoFinal;
      el.dataset.homeAnimando = "0";
      el.classList.remove("home-valor-animando");
      if (card) card.classList.remove("home-kpi-oscilando");
    }
  }
  requestAnimationFrame(passo);
}

function homeAplicarAnimacoesEm(container) {
  container.querySelectorAll(".cockpit-kpi .valor").forEach(homeAnimarValor);
}

function homeIniciarObservadorDashboard() {
  HOME_DASHBOARD_CONTAINERS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const observer = new MutationObserver(() => homeAplicarAnimacoesEm(el));
    observer.observe(el, { childList: true, subtree: true, characterData: true });
  });
}

// Anel circular de "% da Meta" (Resultado do Mês) — lido diretamente de
// cockpitState.ultimoCalculo (o mesmo cache usado pelo ticker/Situação Agora),
// sem recalcular nada.
function homeAtualizarAnelMeta() {
  const cache = typeof cockpitState !== "undefined" ? cockpitState.ultimoCalculo : null;
  const circulo = document.getElementById("homeAnelMetaCirculo");
  const texto = document.getElementById("homeAnelMetaValor");
  if (!circulo || !texto) return;
  const perimetro = 2 * Math.PI * 52;
  circulo.style.strokeDasharray = `${perimetro}`;
  const pct = cache?.c?.resultadoMes?.pctMeta;
  const pctClamp = Number.isFinite(pct) ? Math.max(0, Math.min(150, pct)) : 0;
  const offsetAlvo = perimetro * (1 - Math.min(1, pctClamp / 100));
  circulo.style.transition = "stroke-dashoffset 1s cubic-bezier(.22,.9,.3,1), stroke .3s";
  circulo.style.strokeDashoffset = `${offsetAlvo}`;
  circulo.classList.toggle("home-anel-acima-meta", pctClamp >= 100);
  texto.textContent = Number.isFinite(pct) ? `${pct}%` : "—";
  homeAnimarValor(texto);
}

// ---------------------------------------------------------------------------
// Chatbot — buscador rápido de relatórios do catálogo (RELATORIOS, js/config.js)
// por palavra-chave. Determinístico e instantâneo (sem custo/API): ranqueia
// pelo número de termos da pergunta que aparecem no rótulo/descrição/grupo de
// cada relatório. "Perguntar à IA" (quando há uma chave configurada em
// IA_CONFIG, js/ia-engine.js) fica como opção extra pra perguntas livres.
// ---------------------------------------------------------------------------
function homeChatToggle() {
  const painel = document.getElementById("homeChatPainel");
  if (!painel) return;
  const abrindo = painel.classList.contains("oculto");
  painel.classList.toggle("oculto");
  if (abrindo) {
    document.getElementById("homeChatInput")?.focus();
    if (!painel.dataset.homeChatIniciado) {
      homeChatAdicionarMensagem("bot", 'Oi! Me diga o que você quer ver (ex: "win rate deste mês", "negócios parados", "reuniões da semana") que eu já abro o relatório certo pra você.');
      painel.dataset.homeChatIniciado = "1";
    }
  }
}

function homeChatAdicionarMensagem(quem, html) {
  const lista = document.getElementById("homeChatMensagens");
  if (!lista) return;
  const bolha = document.createElement("div");
  bolha.className = `home-chat-bolha home-chat-${quem}`;
  bolha.innerHTML = html;
  lista.appendChild(bolha);
  lista.scrollTop = lista.scrollHeight;
}

function homeChatBuscarRelatorios(pergunta) {
  const termos = normalizarTextoChave(pergunta).split(/\s+/).filter((t) => t.length > 2);
  if (!termos.length || typeof RELATORIOS === "undefined") return [];
  const pontuados = Object.entries(RELATORIOS).map(([chave, rel]) => {
    const alvo = normalizarTextoChave(`${rel.label} ${rel.descricao} ${rel.grupo}`);
    const pontos = termos.reduce((acc, t) => acc + (alvo.includes(t) ? 1 : 0), 0);
    return { chave, rel, pontos };
  }).filter((x) => x.pontos > 0);
  pontuados.sort((a, b) => b.pontos - a.pontos);
  return pontuados.slice(0, 4);
}

function homeChatEnviar() {
  const input = document.getElementById("homeChatInput");
  const pergunta = (input?.value || "").trim();
  if (!pergunta) return;
  homeChatAdicionarMensagem("usuario", escapeHtmlRelatorio(pergunta));
  input.value = "";
  const resultados = homeChatBuscarRelatorios(pergunta);
  if (resultados.length) {
    const chips = resultados.map(({ chave, rel }) => {
      const m = rel.label.match(/^(\S+)\s*(.*)$/);
      const icone = m ? m[1] : "📄", titulo = m ? m[2] : rel.label;
      return `<button type="button" class="home-chat-chip" onclick="selecionarRelatorioRapido('${chave}')">${icone} ${escapeHtmlRelatorio(titulo)}</button>`;
    }).join("");
    homeChatAdicionarMensagem("bot", `Achei ${resultados.length > 1 ? "estes relatórios" : "este relatório"}:<div class="home-chat-chips">${chips}</div>`);
  } else {
    const temIA = typeof IA_CONFIG !== "undefined" && IA_CONFIG.getChave();
    homeChatAdicionarMensagem("bot", `Não achei um relatório específico do catálogo pra isso.${temIA ? ' <button type="button" class="home-chat-chip" onclick="homeChatPerguntarIA(' + JSON.stringify(pergunta) + ')">🤖 Perguntar à IA</button>' : " Tente palavras como \"forecast\", \"win rate\", \"SDR\", \"pipeline\", \"aging\"."}`);
  }
}

async function homeChatPerguntarIA(pergunta) {
  homeChatAdicionarMensagem("bot", "Pensando...");
  const lista = document.getElementById("homeChatMensagens");
  const bolhaCarregando = lista?.lastElementChild;
  try {
    const resposta = await iaEnviarMensagemLLM(`Pergunta do usuário sobre relatórios comerciais do portal AtlasGR: "${pergunta}". Responda em 1-2 frases, sugerindo o caminho mais rápido dentro do portal (Cockpit, Relatórios Comerciais, SDR & Operação ou Extração) sem inventar números — você não tem acesso aos dados do CRM agora, só à estrutura do portal.`);
    if (bolhaCarregando) bolhaCarregando.innerHTML = escapeHtmlRelatorio(resposta).replace(/\n/g, "<br>");
  } catch (e) {
    if (bolhaCarregando) bolhaCarregando.textContent = "Não consegui falar com a IA agora: " + e.message;
  }
}

function homeChatEnterEnvia(ev) {
  if (ev.key === "Enter") { ev.preventDefault(); homeChatEnviar(); }
}

// ---------------------------------------------------------------------------
// Inicialização da página
// ---------------------------------------------------------------------------
function homeIniciarDashboard() {
  if (!document.getElementById("home-bloco-dashboard")) return; // só roda na Home
  homeIniciarRelogioAnalogico();
  homeCalRenderizar();
  homeIniciarObservadorDashboard();
  setInterval(homeAtualizarAnelMeta, 1000);
  // Primeira carga automática do dashboard: se já existe webhook salvo, busca
  // uma vez ao abrir a Home (sem isso, o dashboard ficaria vazio até o ciclo
  // de auto-atualização de 5min de iniciarCockpitExecutivo rodar sozinho).
  const salvo = typeof obterWebhookSalvo === "function" ? obterWebhookSalvo() : "";
  if (salvo) {
    const campo = document.getElementById("webhook");
    if (campo && !campo.value.trim()) campo.value = salvo;
    if (typeof atualizarCockpit === "function") atualizarCockpit();
  }
}
