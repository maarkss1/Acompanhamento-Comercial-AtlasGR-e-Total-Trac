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

// A contagem animada dos números de KPI (e a barrinha que oscila de cor até
// assentar) mora em js/cockpit.js (cockpitAnimarValor/cockpitIniciarAnimacaoValores)
// — cockpit.js já observa os containers "home*" (COCKPIT_CONTAINERS_KPI), então
// a Home ganha o mesmo efeito de graça, sem duplicar a lógica aqui.

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
  if (typeof cockpitAnimarValor === "function") cockpitAnimarValor(texto);
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
