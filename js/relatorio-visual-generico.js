// ---------------------------------------------------------------------------
// v42 — Modelo visual GENÉRICO dos relatórios (catálogo, Jornada, Diário SDR)
// no estilo "AtlasGR Executive Intelligence": gera um HTML autocontido a
// partir do resultado padrão { titulo, subtitulo, kpis[], tabelas[], nota }.
//
// Estrutura do documento gerado:
//   timbre → hero editorial com placar → sumário fixo → "executive pulse"
//   (bento) → indicadores complementares (gaveta) → capítulos → cockpit
//   (orbe, composição, tendência, funil, foco conectado) → diagnóstico IA →
//   uma seção por tabela (gráfico primeiro, dados sob demanda) → metodologia.
//
// Tudo é derivado dos dados: nenhum número é inventado. Heurísticas olham
// rótulos/valores dos KPIs e chaves/valores das tabelas. Relatórios podem
// enriquecer com campos opcionais: tabela.descricao (texto "como ler"),
// resultado.capitulos ([{antes, titulo, descricao}]) e resultado.manchete.
//
// CSS e JS embutidos vivem em js/relatorio-visual-runtime.js.
// Dependências globais: escapeHtmlRelatorio (jornada.js), marcaAtiva
// (config.js), moedaRelatorio, formatarDataBR/formatarDataISO (bitrix-api.js),
// iaDiagnosticarRelatorioCatalogo/iaRenderizarCardInsightsHTML (opcionais).
// ---------------------------------------------------------------------------

// Interpreta um texto já formatado ("R$ 1.513,87", "50.93%", "30 dias",
// "1.234", "—") como número, ou null. Usada aqui e embutida via .toString()
// no JS do relatório exportado — uma fonte só, testável no Node.
function relatorioVisualParseNumero(texto) {
  var s = String(texto == null ? "" : texto).trim();
  if (!s || s === "—" || s === "-") return null;
  var m = s.match(/^(?:R\$\s?)?([-+]?[\d.,]+)\s*(%|p\.p\.|dias?|d|h|min)?$/i);
  if (!m) return null;
  var n = m[1];
  if (n.indexOf(".") > -1 && n.indexOf(",") > -1) n = n.replace(/\./g, "").replace(",", ".");
  else if (n.indexOf(",") > -1) n = n.replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(n)) n = n.replace(/\./g, "");
  var v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function relatorioVisualKpiAnimacao(valor) {
  var s = String(valor == null ? "" : valor).trim();
  var m;
  if ((m = s.match(/^R\$\s?(-?[\d.]+,\d{2})$/))) return { numero: relatorioVisualParseNumero(s), prefixo: "R$ ", sufixo: "", decimais: 2, milhar: 1 };
  if ((m = s.match(/^(-?\d+)(?:\.(\d+))?%$/))) return { numero: Number(m[1] + (m[2] ? "." + m[2] : "")), prefixo: "", sufixo: "%", decimais: m[2] ? m[2].length : 0, milhar: 0 };
  if ((m = s.match(/^(-?\d{1,3}(?:\.\d{3})+|-?\d+)$/))) return { numero: relatorioVisualParseNumero(s), prefixo: "", sufixo: "", decimais: 0, milhar: s.indexOf(".") > -1 ? 1 : 0 };
  if ((m = s.match(/^(\d+)\s+([a-zA-Zçãõ]+)$/))) return { numero: Number(m[1]), prefixo: "", sufixo: " " + m[2], decimais: 0, milhar: 0 };
  return null;
}

function relatorioVisualTipoKpi(anim) {
  if (!anim) return "texto";
  if (anim.prefixo === "R$ ") return "moeda";
  if (anim.sufixo === "%") return "pct";
  if (anim.sufixo) return "unidade";
  return "contagem";
}

// Classifica os KPIs pra alimentar hero, bento e cockpit: indicador
// principal (primeiro percentual), receita (primeiro R$), contagens e a
// "composição" — subconjunto de contagens que soma exatamente a primeira
// (ex.: Oportunidades = Ganhos + Perdas + Em aberto + Piloto).
// Compartilhado com pontosDeAtencaoGenerico: um KPI de alerta ("Sem CLOSEDATE",
// "CLOSEDATE vencida", "Fora SLA"...) nunca deve virar o indicador principal
// do hero/bento nem a base da composição — ele continua na lista completa
// (gaveta) e no banner de atenção, só não disputa destaque.
var RELATORIO_VISUAL_PADROES_ALERTA = /vencid|atrasad|sem atividade|sem closedate|sem clientedate|fora do sla|fora sla|cr[ií]tico|sem contato|pendente|não localizado/i;

function relatorioVisualClassificarKpis(kpis) {
  var lista = (kpis || []).map(function (k, i) { var anim = relatorioVisualKpiAnimacao(k.valor); return { indice: i, rotulo: k.rotulo, valor: k.valor, descricao: k.descricao || "", anim: anim, tipo: relatorioVisualTipoKpi(anim) }; });
  var destacaveis = lista.filter(function (k) { return !RELATORIO_VISUAL_PADROES_ALERTA.test(k.rotulo || ""); });
  var porTipo = function (t) { return destacaveis.filter(function (k) { return k.tipo === t; }); };
  var contagens = porTipo("contagem"), pcts = porTipo("pct"), moedas = porTipo("moeda"), unidades = porTipo("unidade");
  var primario = pcts[0] || contagens[0] || destacaveis[0] || lista[0] || null;
  var composicao = null;
  if (contagens.length >= 3) {
    var base = contagens[0], partes = contagens.slice(1);
    for (var n = partes.length; n >= 2; n--) {
      var sub = partes.slice(0, n), soma = sub.reduce(function (s, k) { return s + k.anim.numero; }, 0);
      if (soma === base.anim.numero && base.anim.numero > 0) { composicao = { base: base, partes: sub }; break; }
    }
  }
  return { lista: lista, primario: primario, moeda: moedas[0] || null, moedas: moedas, contagens: contagens, pcts: pcts, unidades: unidades, composicao: composicao };
}

function relatorioVisualFormatarNumero(v, chave) {
  var n = Number(v) || 0;
  if (/VALOR|RECEITA|TICKET|PONDERAD|FATURA/i.test(chave || "")) return moedaRelatorio(n);
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function relatorioVisualRotuloBonito(chave) {
  var mapa = { MES: "Mês", ESTAGIO: "Estágio", RESPONSAVEL: "Responsável", NEGOCIOS: "Negócios", PASSARAM: "Passaram", VISITARAM: "Passaram", DECIDIDOS: "Decididos", OPORTUNIDADES: "Oportunidades", RECEITA: "Receita", VALOR: "Valor", DEALS: "Negócios", ATIVIDADES: "Atividades", LEADS: "Leads", GANHOS: "Ganhos", PERDAS: "Perdas", WIN_RATE_PCT: "Win Rate", TAXA_AVANCO_PCT: "Taxa de avanço" };
  if (mapa[chave]) return mapa[chave];
  var base = String(chave || "").replace(/_PCT$/, "");
  if (mapa[base]) return mapa[base];
  return base.replace(/_/g, " ").toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); });
}

function relatorioVisualRotuloCurto(titulo) {
  var s = String(titulo || "").split(/\s[—–•|]\s|\s\(/)[0].trim();
  return s.length > 26 ? s.slice(0, 25).trim() + "…" : s;
}

function relatorioVisualPct(v, d) {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }) + "%";
}

var RELATORIO_VISUAL_CHAVES_ROTULO = ["CLIENTE", "RESPONSAVEL", "STATUS", "ESTAGIO", "FUNIL", "CANAL", "PIPELINE", "NOME", "ORIGEM", "PRODUTO", "SDR", "MES", "ETAPA", "SITUACAO", "TIPO", "RESULTADO", "CATEGORIA", "EMPRESA", "VENDEDOR", "MOTIVO", "FAIXA", "METRICA"];
var RELATORIO_VISUAL_CHAVES_METRICA = ["VALOR", "RECEITA", "ATIVIDADES", "NEGOCIOS", "LEADS", "QUANTIDADE", "TICKET", "GANHOS", "PERDIDOS", "TOTAL", "MEDIA_DIA", "VISITARAM", "PONDERADO", "DIAS", "PENDENTES", "ATRASADAS", "PASSARAM", "DECIDIDOS", "DEALS", "OPORTUNIDADES"];

function relatorioVisualChaves(t) {
  var dados = (t && t.dados) || [];
  if (!dados.length) return { dados: dados, chaves: [], numericas: [], textuais: [], pcts: [] };
  var chaves = Object.keys(dados[0] || {});
  var numericas = chaves.filter(function (k) { return !/(^|_)ID$/i.test(k) && dados.every(function (r) { return typeof r[k] === "number" || r[k] === null; }) && dados.some(function (r) { return typeof r[k] === "number"; }); });
  var textuais = chaves.filter(function (k) { return !/(^|_)ID$/i.test(k) && dados.every(function (r) { return typeof r[k] === "string"; }); });
  var pcts = numericas.filter(function (k) { return /_PCT$|PERCENT|^PCT/i.test(k); });
  return { dados: dados, chaves: chaves, numericas: numericas, textuais: textuais, pcts: pcts };
}

// Par rótulo × métrica de qualquer tabela (gráfico de barras padrão).
function relatorioVisualDadosGrafico(t) {
  var c = relatorioVisualChaves(t);
  if (c.dados.length < 2) return null;
  var metricas = c.numericas.filter(function (k) { return c.pcts.indexOf(k) < 0; });
  if (!metricas.length) return null;
  var metrica = RELATORIO_VISUAL_CHAVES_METRICA.find(function (k) { return metricas.includes(k); }) || metricas[0];
  var textuais = c.textuais.filter(function (k) { return k !== metrica; });
  if (!textuais.length) return null;
  var rotuloChave = RELATORIO_VISUAL_CHAVES_ROTULO.find(function (k) { return textuais.includes(k); }) || textuais[0];
  if (new Set(c.dados.map(function (r) { return r[rotuloChave]; })).size < 2) return null;
  var total = c.dados.reduce(function (s, r) { return s + (Number(r[metrica]) || 0); }, 0);
  if (total <= 0) return null;
  var pctChave = c.pcts[0] || null;
  var linhas = c.dados.slice().sort(function (a, b) { return (Number(b[metrica]) || 0) - (Number(a[metrica]) || 0); }).slice(0, 9)
    .map(function (r) { return { ROTULO: r[rotuloChave] || "—", VALOR: Number(r[metrica]) || 0, PCT: pctChave ? r[pctChave] : null }; });
  return { rotuloChave: rotuloChave, metrica: metrica, pctChave: pctChave, linhas: linhas, total: total, titulo: relatorioVisualRotuloBonito(metrica) + " por " + relatorioVisualRotuloBonito(rotuloChave).toLowerCase() };
}

function relatorioVisualEhMes(v) { return /^\d{4}-\d{2}/.test(String(v || "")); }

// Decide o tipo de visual da seção: tendência (série mensal), comparativo
// (atual × anterior), distribuição (poucas faixas com %) ou barras.
function relatorioVisualTipoVisual(t) {
  var c = relatorioVisualChaves(t);
  if (!c.dados.length) return { tipo: null };
  var rotulos = (t.colunas || []).map(function (x) { return String(x.label || ""); });
  if (rotulos.some(function (l) { return /atual/i.test(l); }) && rotulos.some(function (l) { return /anterior/i.test(l); })) return { tipo: "comparativo" };
  var mesChave = c.textuais.find(function (k) { return c.dados.every(function (r) { return relatorioVisualEhMes(r[k]); }); });
  if (mesChave && c.dados.length >= 3 && c.numericas.length) {
    var y = c.pcts[c.pcts.length - 1] || null;
    var contagem = c.numericas.find(function (k) { return c.pcts.indexOf(k) < 0 && /DECIDIDOS|NEGOCIOS|DEALS|TOTAL|OPORTUNIDADES|ATIVIDADES|LEADS/i.test(k); }) || c.numericas.find(function (k) { return c.pcts.indexOf(k) < 0; }) || null;
    var g = c.numericas.find(function (k) { return /GANHOS/i.test(k); }), p = c.numericas.find(function (k) { return /PERDAS|PERDIDOS/i.test(k); });
    return { tipo: "tendencia", mesChave: mesChave, yChave: y || contagem, ehPct: !!y, barrasChave: y ? (g && p ? null : contagem) : null, ganhosChave: g || null, perdasChave: p || null };
  }
  // Distribuição = a coluna % é participação no total (soma ≈ 100). Taxas por
  // linha (avanço, win rate) não somam 100 e caem no ranking de barras.
  var participacao = c.pcts.find(function (k) { var soma = c.dados.reduce(function (s, r) { return s + (Number(r[k]) || 0); }, 0); return soma >= 95 && soma <= 105; });
  if (c.dados.length <= 8 && participacao && c.textuais.length) return { tipo: "distribuicao", rotuloChave: c.textuais[0], pctChave: participacao, contagemChave: c.numericas.find(function (k) { return c.pcts.indexOf(k) < 0; }) || null };
  var g2 = relatorioVisualDadosGrafico(t);
  return g2 ? { tipo: "barras", grafico: g2 } : { tipo: null };
}

// Funil pro cockpit: tabela com etapa + volume que passou.
function relatorioVisualDadosFunil(tabelas) {
  for (var i = 0; i < (tabelas || []).length; i++) {
    var t = tabelas[i], c = relatorioVisualChaves(t);
    var etapa = c.textuais.find(function (k) { return /ETAPA|ESTAGIO|FASE/i.test(k); });
    var vol = c.numericas.find(function (k) { return /PASSARAM|VISITARAM|ENTRARAM/i.test(k); });
    if (!etapa || !vol || c.dados.length < 2) continue;
    var taxa = c.pcts.find(function (k) { return /AVANCO|TAXA/i.test(k); }) || null;
    var linhas = c.dados.map(function (r) { return { nome: r[etapa], vol: Number(r[vol]) || 0, taxa: taxa && typeof r[taxa] === "number" ? r[taxa] : null }; }).filter(function (r) { return r.vol > 0; }).sort(function (a, b) { return b.vol - a.vol; }).slice(0, 6);
    if (linhas.length < 2) continue;
    var gargalo = linhas.filter(function (r) { return r.taxa != null && r.vol >= 20 && !/ganho|perdid/i.test(r.nome); }).sort(function (a, b) { return a.taxa - b.taxa; })[0] || null;
    return { indice: i, linhas: linhas, gargalo: gargalo, volChave: vol };
  }
  return null;
}

// Série mensal pro cockpit (sparkline): primeira tabela do tipo tendência.
function relatorioVisualDadosSerie(tabelas) {
  for (var i = 0; i < (tabelas || []).length; i++) {
    var tv = relatorioVisualTipoVisual(tabelas[i]);
    if (tv.tipo !== "tendencia" || !tv.yChave) continue;
    var pts = tabelas[i].dados.slice().sort(function (a, b) { return String(a[tv.mesChave]).localeCompare(String(b[tv.mesChave])); })
      .map(function (r) { return { m: r[tv.mesChave], v: typeof r[tv.yChave] === "number" ? r[tv.yChave] : null, n: tv.ganhosChave && tv.perdasChave ? (Number(r[tv.ganhosChave]) || 0) + (Number(r[tv.perdasChave]) || 0) : (tv.barrasChave ? Number(r[tv.barrasChave]) || 0 : null) }; })
      .filter(function (p) { return p.v != null; });
    if (pts.length < 2) continue;
    return { indice: i, pontos: pts, ehPct: tv.ehPct, rotulo: relatorioVisualRotuloBonito(tv.yChave) };
  }
  return null;
}

function relatorioVisualNotaEmItens(nota) {
  var s = String(nota || "").trim();
  if (!s) return [];
  return s.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ("])/).map(function (x) { return x.trim(); }).filter(Boolean);
}

function pontosDeAtencaoGenerico(kpis) {
  var achados = (kpis || []).filter(function (x) {
    var n = Number(String(x.valor).replace(/[^\d,.-]/g, "").replace(",", "."));
    return RELATORIO_VISUAL_PADROES_ALERTA.test(x.rotulo || "") && Number.isFinite(n) && n > 0;
  });
  if (!achados.length) return "";
  var itens = achados.map(function (x) { return "<li><strong>" + escapeHtmlRelatorio(x.valor) + "</strong> — " + escapeHtmlRelatorio(x.rotulo) + "</li>"; }).join("");
  return '<div class="alerta anima"><span class="alerta-icone">⚠️</span><div><strong>Pontos de atenção encontrados neste relatório</strong><ul>' + itens + "</ul></div></div>";
}

// ---------------------------------------------------------------------------
// Blocos de HTML
// ---------------------------------------------------------------------------
function relatorioVisualAttrsAnim(anim) {
  return anim ? ' data-numero="' + anim.numero + '" data-prefixo="' + escapeHtmlRelatorio(anim.prefixo) + '" data-sufixo="' + escapeHtmlRelatorio(anim.sufixo) + '" data-decimais="' + anim.decimais + '" data-milhar="' + anim.milhar + '"' : "";
}

function relatorioVisualKpiHtml(x, i, destaque) {
  return '<div class="kpi' + (destaque ? " kpi-destaque" : "") + ' anima" style="transition-delay:' + (i * 40) + 'ms" title="Clique para copiar">' +
    '<div class="kpi-rotulo">' + escapeHtmlRelatorio(x.rotulo) + "</div>" +
    '<div class="kpi-valor"' + relatorioVisualAttrsAnim(x.anim) + ">" + escapeHtmlRelatorio(x.valor) + "</div>" +
    (x.descricao ? '<div class="kpi-desc">' + escapeHtmlRelatorio(x.descricao) + "</div>" : "") + "</div>";
}

function relatorioVisualTituloEditorial(titulo) {
  var partes = String(titulo || "").split(/\s[•|—–]\s/);
  var a = partes[0].trim(), b = partes.slice(1).join(" · ").trim();
  var pontua = function (s) { return /[.!?]$/.test(s) ? s : s + "."; };
  if (!b) return escapeHtmlRelatorio(a);
  return escapeHtmlRelatorio(pontua(a)) + "<br><em>" + escapeHtmlRelatorio(pontua(b.charAt(0).toUpperCase() + b.slice(1))) + "</em>";
}

function relatorioVisualHeroHtml(r, cls, totalRegistros, geradoEm) {
  var subtitulo = String(r.subtitulo || "").replace(/<[^>]+>/g, "") || "Leitura executiva gerada automaticamente a partir do Bitrix24.";
  var principal = cls.primario;
  var usados = principal ? [principal.indice] : [];
  var candidatos = [cls.moeda, cls.contagens[0], cls.unidades[0]].filter(Boolean).concat(cls.lista);
  var minis = [];
  candidatos.forEach(function (k) { if (minis.length < 4 && usados.indexOf(k.indice) < 0 && k.tipo !== "texto") { minis.push(k); usados.push(k.indice); } });
  var placar = "";
  if (principal) {
    placar = '<div class="placar" aria-label="Resumo dos principais indicadores"><div class="placar-principal"><div><strong' + relatorioVisualAttrsAnim(principal.anim) + ">" + escapeHtmlRelatorio(principal.valor) + '</strong><span class="rot">' + escapeHtmlRelatorio(principal.rotulo) + "</span></div>" +
      (principal.descricao ? "<p>" + escapeHtmlRelatorio(principal.descricao) + "</p>" : "") + "</div>" +
      '<div class="placar-minis">' + minis.map(function (k) { return "<div><strong>" + escapeHtmlRelatorio(k.valor) + "</strong><span>" + escapeHtmlRelatorio(k.rotulo) + "</span></div>"; }).join("") + "</div></div>";
  }
  return '<header class="hero"><div class="hero-inner"><div><p class="hero-eyebrow">' + escapeHtmlRelatorio(marcaAtiva().nome) + ' · Revenue Intelligence</p><h1>' + relatorioVisualTituloEditorial(r.titulo) + '</h1><p class="subtitulo">' + subtitulo + "</p>" +
    '<div class="hero-note"><i></i><span>Dados extraídos do Bitrix24 · ' + totalRegistros.toLocaleString("pt-BR") + " registros em " + (r.tabelas || []).length + " análises · atualização em " + geradoEm + "</span></div></div>" + placar + "</div></header>";
}

function relatorioVisualTileHtml(k, classe, rotuloExtra) {
  if (!k) return "";
  return '<article class="tile ' + classe + '"><span class="tile-rotulo">' + escapeHtmlRelatorio(rotuloExtra || k.rotulo) + '</span><div class="tile-valor"' + relatorioVisualAttrsAnim(k.anim) + ">" + escapeHtmlRelatorio(k.valor) + '</div><p class="tile-meta">' + escapeHtmlRelatorio(k.descricao || (rotuloExtra ? k.rotulo : "")) + "</p></article>";
}

function relatorioVisualBentoHtml(r, cls, diagIA, totalRegistros, geradoEm) {
  var usados = [];
  var pegar = function (k) { if (k && usados.indexOf(k.indice) < 0) { usados.push(k.indice); return k; } return null; };
  var escuro = pegar(cls.moeda) || pegar(cls.primario);
  var laranja = pegar(cls.primario) || pegar(cls.contagens[0]);
  var restantes = cls.lista.filter(function (k) { return k.tipo !== "texto"; });
  var suave1 = null, suave2 = null;
  restantes.forEach(function (k) { if (usados.indexOf(k.indice) >= 0) return; if (!suave1) suave1 = pegar(k); else if (!suave2) suave2 = pegar(k); });
  var pe = restantes.filter(function (k) { return usados.indexOf(k.indice) < 0; }).slice(0, 2);
  var manchete = r.manchete || (diagIA && diagIA.gargalos && diagIA.gargalos[0]) || (diagIA && diagIA.pontosFortes && diagIA.pontosFortes[0]) || ("Leitura executiva de " + r.titulo + ".");
  var confianca = cls.composicao
    ? '<article class="tile tile-confianca"><div class="selo">✓</div><div><span class="tile-rotulo">Data Trust</span><b>Coorte reconciliada</b><p>' + escapeHtmlRelatorio(cls.composicao.base.valor + " " + cls.composicao.base.rotulo.toLowerCase() + " = " + cls.composicao.partes.map(function (k) { return k.valor + " " + k.rotulo.toLowerCase(); }).join(" + ")) + ".</p></div></article>"
    : '<article class="tile tile-confianca"><div class="selo">✓</div><div><span class="tile-rotulo">Data Trust</span><b>Extração direta do CRM</b><p>' + totalRegistros.toLocaleString("pt-BR") + " registros em " + (r.tabelas || []).length + " análises · gerado em " + geradoEm + ", sem ajuste manual.</p></div></article>";
  var tileEscuro = escuro ? '<article class="tile tile-escuro"><span class="tile-rotulo">' + escapeHtmlRelatorio(escuro.rotulo) + '</span><div class="tile-valor"' + relatorioVisualAttrsAnim(escuro.anim) + ">" + escapeHtmlRelatorio(escuro.valor) + '</div><p class="tile-meta">' + escapeHtmlRelatorio(escuro.descricao) + "</p>" +
    (pe.length ? '<div class="tile-escuro-pe">' + pe.map(function (k) { return "<div><span>" + escapeHtmlRelatorio(k.rotulo) + "</span><b>" + escapeHtmlRelatorio(k.valor) + "</b></div>"; }).join("") + "</div>" : "") + "</article>" : "";
  return '<section class="comando" id="visao-executiva"><div class="comando-topo"><div><div class="kicker">Executive pulse</div><h2>' + escapeHtmlRelatorio(manchete) + "</h2></div><p>Primeiro leia a história. Depois abra os dados detalhados em cada análise para auditar linha a linha.</p></div>" +
    '<div class="bento">' + tileEscuro + relatorioVisualTileHtml(laranja, "tile-laranja", "Indicador principal") + relatorioVisualTileHtml(suave1, "tile-suave tile-verde") + relatorioVisualTileHtml(suave2, "tile-suave tile-ambar") + confianca + "</div></section>";
}

function relatorioVisualCapituloHtml(num, titulo, descricao, escuro) {
  return '<div class="capitulo' + (escuro ? " escuro" : "") + '"><div><span class="capitulo-num">' + escapeHtmlRelatorio(num) + "</span><h2>" + escapeHtmlRelatorio(titulo) + "</h2></div><p>" + escapeHtmlRelatorio(descricao) + "</p></div>";
}

function relatorioVisualCockpitHtml(r, cls, serie, funil) {
  var cards = [];
  var p = cls.primario && cls.primario.tipo === "pct" ? cls.primario : null;
  if (p) {
    cards.push('<article class="ck-card ck-orbe"><h3>' + escapeHtmlRelatorio(p.rotulo) + '</h3><div class="orbe-wrap"><div class="orbe"><svg width="158" height="158" viewBox="0 0 158 158" aria-hidden="true"><defs><linearGradient id="gradOrbe" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FF8008"/><stop offset="100%" stop-color="#FF5618"/></linearGradient></defs><circle class="aro" cx="79" cy="79" r="60"/><circle class="arco" cx="79" cy="79" r="60" data-pct="' + p.anim.numero + '"/></svg><div class="orbe-valor"><div class="v">' + escapeHtmlRelatorio(p.valor) + '</div><div class="r">' + (cls.composicao ? "de " + escapeHtmlRelatorio(cls.composicao.base.valor) + " " + escapeHtmlRelatorio(cls.composicao.base.rotulo.toLowerCase()) : "indicador principal") + "</div></div></div></div>" +
      '<p class="ck-legenda">' + escapeHtmlRelatorio(p.descricao || "Percentual principal deste relatório.") + "</p></article>");
  }
  if (cls.composicao) {
    var base = cls.composicao.base, cores = ["var(--brand)", "#6f6560", "var(--gold)", "#5b7ba6", "#9c6bd1", "#2d9c8f"];
    var segs = cls.composicao.partes.map(function (k, i) { var pct = k.anim.numero / base.anim.numero * 100; return { k: k, pct: pct, cor: cores[i % cores.length] }; }).filter(function (s) { return s.pct > 0; });
    cards.push('<article class="ck-card ck-mix"><h3>Composição de ' + escapeHtmlRelatorio(base.rotulo.toLowerCase()) + '<span class="ck-ir" style="cursor:default">' + escapeHtmlRelatorio(base.valor) + " no total</span></h3>" +
      '<div class="mix-barra">' + segs.map(function (s) { return '<div class="mix-seg" data-rotulo="' + escapeHtmlRelatorio(s.k.rotulo) + '" style="flex:' + s.pct.toFixed(2) + ' 1 0;background:' + s.cor + '" title="' + escapeHtmlRelatorio(s.k.rotulo + ": " + s.k.valor + " (" + relatorioVisualPct(s.pct) + ")") + '">' + (s.pct > 7 ? relatorioVisualPct(s.pct, 0) : "") + "</div>"; }).join("") + "</div>" +
      '<div class="mix-legenda">' + segs.map(function (s) { return '<span class="mix-item" title="' + escapeHtmlRelatorio(s.k.descricao) + '"><span class="mix-ponto" style="background:' + s.cor + '"></span>' + escapeHtmlRelatorio(s.k.rotulo) + " <b>" + escapeHtmlRelatorio(s.k.valor) + "</b> · " + relatorioVisualPct(s.pct) + "</span>"; }).join("") + "</div>" +
      '<p class="ck-legenda">' + segs.map(function (s) { return "<b>" + relatorioVisualPct(s.pct) + "</b> " + escapeHtmlRelatorio(s.k.rotulo.toLowerCase()); }).join(" · ") + ". A soma fecha exatamente com o total — nenhum registro ficou sem classificação.</p></article>");
  }
  if (serie) {
    var pts = serie.pontos, W = 300, H = 100, pad = 6;
    var mx = Math.max.apply(null, pts.map(function (q) { return q.v; })), mn = Math.min.apply(null, pts.map(function (q) { return q.v; })), span = (mx - mn) || 1;
    var X = function (i) { return pad + i * (W - 2 * pad) / (pts.length - 1); }, Y = function (v) { return H - pad - ((v - mn) / span) * (H - 2 * pad); };
    var d = pts.map(function (q, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(q.v).toFixed(1); }).join(" ");
    var fmtV = function (v) { return serie.ehPct ? relatorioVisualPct(v, 2) : Number(v).toLocaleString("pt-BR"); };
    var ult = pts[pts.length - 1], pen = pts[pts.length - 2], melhor = pts.reduce(function (a, b) { return b.v > a.v ? b : a; });
    var dif = ult.v - pen.v;
    cards.push('<article class="ck-card ck-trend"><h3>Tendência · ' + escapeHtmlRelatorio(serie.rotulo) + '<button type="button" class="ck-ir" data-ir="secao-' + (serie.indice + 1) + '">detalhar ›</button></h3>' +
      '<div class="spark"><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none"><defs><linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FF5618" stop-opacity=".28"/><stop offset="100%" stop-color="#FF5618" stop-opacity="0"/></linearGradient></defs><path class="area" d="' + d + " L " + X(pts.length - 1).toFixed(1) + " " + H + " L " + X(0).toFixed(1) + " " + H + ' Z"/><path class="linha" d="' + d + '"/>' +
      pts.map(function (q, i) { return '<circle class="pt" cx="' + X(i).toFixed(1) + '" cy="' + Y(q.v).toFixed(1) + '" r="3.4" data-rotulo="' + escapeHtmlRelatorio(q.m) + '" data-tip="' + escapeHtmlRelatorio(q.m + " · " + fmtV(q.v) + (q.n != null ? " · " + q.n + " registros" : "")) + '"/>'; }).join("") +
      '</svg><div class="spark-tip"></div><div class="spark-eixo"><span>' + escapeHtmlRelatorio(pts[0].m) + "</span><span>" + escapeHtmlRelatorio(ult.m) + "</span></div></div>" +
      '<p class="ck-legenda">Último mês da série: <b>' + escapeHtmlRelatorio(ult.m) + '</b> com <span class="destaque">' + fmtV(ult.v) + "</span> (" + (dif >= 0 ? "+" : "") + (serie.ehPct ? dif.toFixed(1).replace(".", ",") + " p.p." : Number(dif).toLocaleString("pt-BR")) + " sobre " + escapeHtmlRelatorio(pen.m) + "). Melhor mês: <b>" + escapeHtmlRelatorio(melhor.m) + "</b> (" + fmtV(melhor.v) + ")." + (ult.n != null && ult.n <= 4 ? " <b>Atenção:</b> o último mês tem amostra pequena — leia a tendência, não o ponto." : "") + "</p></article>");
  }
  if (funil) {
    var mxv = funil.linhas[0].vol;
    cards.push('<article class="ck-card ck-funil"><h3>Funil — onde o volume trava<button type="button" class="ck-ir" data-ir="secao-' + (funil.indice + 1) + '">detalhar ›</button></h3><div class="funil3d">' +
      funil.linhas.map(function (l) { return '<div class="fase' + ((/ganho|perdid/i.test(l.nome) || (l.taxa != null && l.taxa < 5)) ? " fria" : "") + '" data-rotulo="' + escapeHtmlRelatorio(l.nome) + '" title="' + escapeHtmlRelatorio(l.nome + ": " + l.vol + " passaram") + '"><div class="fase-topo"><span>' + escapeHtmlRelatorio(l.nome) + "</span><span><b>" + l.vol.toLocaleString("pt-BR") + "</b> passaram" + (l.taxa != null ? " · avanço <b>" + relatorioVisualPct(l.taxa) + "</b>" : "") + '</span></div><div class="fase-barra" style="width:' + Math.max(8, l.vol / mxv * 100).toFixed(1) + '%">' + (l.vol / mxv > .18 ? l.vol.toLocaleString("pt-BR") : "") + "</div></div>"; }).join("") + "</div>" +
      '<p class="ck-legenda">' + (funil.gargalo ? "Maior gargalo com volume relevante: <b>" + escapeHtmlRelatorio(funil.gargalo.nome) + "</b> — " + funil.gargalo.vol.toLocaleString("pt-BR") + ' negócios passaram e só <span class="destaque">' + relatorioVisualPct(funil.gargalo.taxa) + "</span> avançaram. Em cinza: etapas terminais ou com avanço abaixo de 5%." : "As barras mostram quantos registros passaram por cada etapa, da maior para a menor.") + "</p></article>");
  }
  if ((r.tabelas || []).length) {
    cards.push('<article class="ck-card ck-foco"><h3>Foco conectado<button type="button" class="foco-limpar" id="focoLimpar" hidden>limpar foco</button></h3><div id="focoCorpo"><p class="foco-vazio">Nenhum item em foco. Clique numa linha de tabela, barra ou etapa — aqui aparece tudo que o relatório sabe sobre ele, reunido das várias análises.</p></div></article>');
  }
  if (!cards.length) return "";
  return '<section class="cockpit" id="cockpit"><div class="ck-grid">' + cards.join("") + "</div></section>";
}

function relatorioVisualShell(kicker, titulo, desc, stat, statRotulo, corpo) {
  return '<div class="v-shell"><div class="v-head"><div><span class="k">' + escapeHtmlRelatorio(kicker) + "</span><h4>" + escapeHtmlRelatorio(titulo) + "</h4><p>" + escapeHtmlRelatorio(desc) + "</p></div>" + (stat ? '<div class="v-stat"><b>' + escapeHtmlRelatorio(stat) + "</b><small>" + escapeHtmlRelatorio(statRotulo) + "</small></div>" : "") + "</div>" + corpo + "</div>";
}

function relatorioVisualVisualHtml(t, tv) {
  if (tv.tipo === "barras") {
    var g = tv.grafico, max = Math.max(1, g.linhas[0].VALOR);
    var linhas = g.linhas.map(function (x, i) {
      var w = Math.max(3, x.VALOR / max * 100).toFixed(1), part = relatorioVisualPct(x.VALOR / g.total * 100);
      return '<div class="v-linha" data-rotulo="' + escapeHtmlRelatorio(x.ROTULO) + '" title="Clique para filtrar a tabela e colocar em foco"><div class="v-nome"><b>' + escapeHtmlRelatorio(x.ROTULO) + "</b><small>#" + (i + 1) + " · " + part + ' do total</small></div><div class="v-track"><div class="v-fill" style="--w:' + w + '%">' + (x.VALOR / max > .2 ? escapeHtmlRelatorio(relatorioVisualFormatarNumero(x.VALOR, g.metrica)) : "") + '</div></div><div class="v-meta">' + escapeHtmlRelatorio(relatorioVisualFormatarNumero(x.VALOR, g.metrica)) + (x.PCT != null ? "<small>" + escapeHtmlRelatorio(relatorioVisualRotuloBonito(g.pctChave)) + " " + relatorioVisualPct(x.PCT) + "</small>" : "<small>" + part + "</small>") + "</div></div>";
    }).join("");
    return relatorioVisualShell("Ranking", g.titulo, "A largura representa " + relatorioVisualRotuloBonito(g.metrica).toLowerCase() + " de cada item; ao lado, a participação no total. Clique numa barra para filtrar a tabela e ver o item em foco.", relatorioVisualPct(g.linhas[0].VALOR / g.total * 100), "concentrado no maior", '<div class="v-linhas">' + linhas + "</div>");
  }
  if (tv.tipo === "comparativo") {
    var cols = t.colunas || [];
    var cards = t.dados.map(function (row) {
      var cel = cols.map(function (c) { return { label: c.label, v: typeof c.valor === "function" ? c.valor(row) : row[c.valor] }; });
      var atual = cel.find(function (c) { return /atual/i.test(c.label); }), outros = cel.filter(function (c) { return c !== cel[0] && c !== atual; });
      return '<article class="v-card"><span>' + escapeHtmlRelatorio(cel[0].v) + '</span><div class="atual">' + escapeHtmlRelatorio(atual ? atual.v : "") + "</div><dl>" + outros.map(function (c) { return "<div><dt>" + escapeHtmlRelatorio(c.label) + "</dt><dd>" + escapeHtmlRelatorio(c.v == null ? "—" : c.v) + "</dd></div>"; }).join("") + "</dl></article>";
    }).join("");
    return relatorioVisualShell("Comparativo", "Atual versus períodos de referência", "Cada card mostra o valor atual e, abaixo, as referências. Variações muito extremas pedem validação de cobertura histórica antes de virar conclusão.", "", "", '<div class="v-cards">' + cards + "</div>");
  }
  if (tv.tipo === "tendencia") {
    var dados = t.dados.slice().sort(function (a, b) { return String(a[tv.mesChave]).localeCompare(String(b[tv.mesChave])); });
    var W = 960, H = 340, L = 50, R = 20, T = 25, B = 48, iw = W - L - R, ih = H - T - B;
    var ys = dados.map(function (d) { return Number(d[tv.yChave]) || 0; });
    var yMax = tv.ehPct ? 100 : Math.max.apply(null, ys) || 1;
    var vol = dados.map(function (d) { return tv.ganhosChave && tv.perdasChave ? (Number(d[tv.ganhosChave]) || 0) + (Number(d[tv.perdasChave]) || 0) : (tv.barrasChave ? Number(d[tv.barrasChave]) || 0 : null); });
    var temVol = vol.some(function (v) { return v != null; }), maxV = Math.max.apply(null, vol.map(function (v) { return v || 0; })) || 1;
    var x = function (i) { return L + (i + .5) * iw / dados.length; }, y = function (v) { return T + (1 - v / yMax) * ih; };
    var barras = temVol ? dados.map(function (d, i) { var bw = iw / dados.length * .48, bh = (vol[i] / maxV) * (ih * .68); return '<rect class="bar' + (vol[i] <= 4 ? " parcial" : "") + '" x="' + (x(i) - bw / 2).toFixed(1) + '" y="' + (T + ih - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="5"><title>' + vol[i] + " registros</title></rect>"; }).join("") : "";
    var line = dados.map(function (d, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(ys[i]).toFixed(1); }).join(" ");
    var area = line + " L " + x(dados.length - 1).toFixed(1) + " " + (T + ih) + " L " + x(0).toFixed(1) + " " + (T + ih) + " Z";
    var grade = [0, .25, .5, .75, 1].map(function (f) { var yy = y(yMax * f); return '<line class="grade" x1="' + L + '" y1="' + yy + '" x2="' + (W - R) + '" y2="' + yy + '"/><text x="4" y="' + (yy + 4) + '">' + (tv.ehPct ? Math.round(yMax * f) + "%" : Math.round(yMax * f).toLocaleString("pt-BR")) + "</text>"; }).join("");
    var fmtY = function (v) { return tv.ehPct ? relatorioVisualPct(v, 2) : relatorioVisualFormatarNumero(v, tv.yChave); };
    var pontos = dados.map(function (d, i) { var m = String(d[tv.mesChave]), lab = m.slice(5, 7) + "/" + m.slice(2, 4); return '<circle class="point' + (temVol && vol[i] <= 4 ? " parcial" : "") + '" cx="' + x(i) + '" cy="' + y(ys[i]) + '" r="4"><title>' + escapeHtmlRelatorio(m + ": " + fmtY(ys[i]) + (temVol ? " · " + vol[i] + " registros" : "")) + '</title></circle><text text-anchor="middle" x="' + x(i) + '" y="' + (H - 21) + '">' + lab + "</text>" + (i === dados.length - 1 ? '<text class="val" text-anchor="end" x="' + (x(i) - 6) + '" y="' + (y(ys[i]) - 10) + '">' + fmtY(ys[i]) + "</text>" : ""); }).join("");
    var svg = '<div class="v-tendencia"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Tendência"><defs><linearGradient id="gradTend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff5618" stop-opacity=".18"/><stop offset="100%" stop-color="#ff5618" stop-opacity="0"/></linearGradient></defs>' + grade + barras + '<path class="area" d="' + area + '"/><path class="line" d="' + line + '"/>' + pontos + "</svg>" +
      '<div class="v-legenda"><span><i></i>' + escapeHtmlRelatorio(relatorioVisualRotuloBonito(tv.yChave)) + "</span>" + (temVol ? '<span><i class="bar"></i>Volume de registros</span><span><i class="parcial"></i>amostra de até 4 registros</span>' : "") + "</div></div>";
    return relatorioVisualShell("Tendência", relatorioVisualRotuloBonito(tv.yChave) + " mês a mês", "Leia em ordem cronológica. " + (temVol ? "As colunas ao fundo mostram o volume de cada mês: meses com amostra pequena produzem taxas extremas sem representar tendência." : "Compare os pontos entre si, não só o último."), fmtY(ys[ys.length - 1]), "último mês", svg);
  }
  if (tv.tipo === "distribuicao") {
    var maxP = Math.max.apply(null, t.dados.map(function (d) { return Number(d[tv.pctChave]) || 0; })) || 1;
    var colunas = t.dados.map(function (d) { var p = Number(d[tv.pctChave]) || 0; return '<div class="v-col" data-rotulo="' + escapeHtmlRelatorio(d[tv.rotuloChave]) + '" title="Clique para filtrar a tabela"><div class="val">' + relatorioVisualPct(p) + '</div><div class="v-col-wrap"><div class="v-col-bar" style="--h:' + Math.max(4, p / maxP * 100).toFixed(1) + '%"></div></div><b>' + escapeHtmlRelatorio(d[tv.rotuloChave]) + "</b>" + (tv.contagemChave ? "<small>" + escapeHtmlRelatorio(relatorioVisualFormatarNumero(d[tv.contagemChave], tv.contagemChave)) + " " + escapeHtmlRelatorio(relatorioVisualRotuloBonito(tv.contagemChave).toLowerCase()) + "</small>" : "") + "</div>"; }).join("");
    var maior = t.dados.reduce(function (a, b) { return (Number(b[tv.pctChave]) || 0) > (Number(a[tv.pctChave]) || 0) ? b : a; });
    return relatorioVisualShell("Distribuição", "Participação por " + relatorioVisualRotuloBonito(tv.rotuloChave).toLowerCase(), "A altura representa a participação de cada faixa no total. Faixas extremas merecem leitura separada — concentração alta em uma ponta costuma indicar cauda longa.", relatorioVisualPct(maior[tv.pctChave]), escapeHtmlRelatorio(String(maior[tv.rotuloChave])).slice(0, 26), '<div class="v-colunas">' + colunas + "</div>");
  }
  return "";
}

function relatorioVisualTabelaHtml(t, rotuloChave) {
  var colunas = (t.colunas || []).map(function (c) { return { label: c.label, valor: typeof c.valor === "function" ? c.valor : function (row) { return row[c.valor]; }, html: !!c.html }; });
  var dados = (t.dados || []).slice(0, t.limite || 300);
  var c0 = relatorioVisualChaves(t);
  var contagemChave = c0.pcts.length ? c0.numericas.find(function (k) { return /DECIDIDOS|NEGOCIOS|DEALS|TOTAL/i.test(k) && c0.pcts.indexOf(k) < 0; }) : null;
  var thead = "<tr>" + colunas.map(function (c) { return "<th>" + escapeHtmlRelatorio(c.label) + "</th>"; }).join("") + "</tr>";
  var tbody = dados.map(function (row) {
    var rot = rotuloChave ? row[rotuloChave] : (c0.textuais[0] ? row[c0.textuais[0]] : null);
    var attr = rot != null && rot !== "" ? ' data-rotulo="' + escapeHtmlRelatorio(rot) + '"' : "";
    var n = contagemChave ? Number(row[contagemChave]) : null;
    var badge = contagemChave && Number.isFinite(n) && n <= 4 ? '<span class="amostra">' + (n === 0 ? "sem decisões" : "amostra baixa · " + n) + "</span>" : "";
    return "<tr" + attr + ">" + colunas.map(function (c, i) { var v = c.valor(row); return "<td>" + (c.html ? v : escapeHtmlRelatorio(v == null ? "" : v)) + (i === 0 ? badge : "") + "</td>"; }).join("") + "</tr>";
  }).join("");
  return '<div><div class="tabela-wrap"><table class="tabela"><thead>' + thead + "</thead><tbody>" + tbody + "</tbody></table></div>" +
    '<div class="tabela-rodape"><span>Clique no cabeçalho para ordenar · clique numa linha para colocar em foco</span><button type="button" class="btn-mini btn-todas" hidden>Mostrar todas</button></div></div>';
}

function relatorioVisualSecaoHtml(t, i) {
  var tv = relatorioVisualTipoVisual(t);
  var visual = relatorioVisualVisualHtml(t, tv);
  var qtd = (t.dados || []).length;
  var colunas = (t.colunas || []).map(function (c) { return c.label; });
  var comoLer = t.descricao || ("Cada linha é um registro com as colunas " + colunas.join(", ") + "." + (visual ? " O visual acima resume a tabela; abra os dados para auditar linha a linha, ordenar e filtrar." : ""));
  var rotuloChave = tv.tipo === "barras" ? tv.grafico.rotuloChave : (tv.mesChave || tv.rotuloChave || null);
  return '<section class="secao anima' + (visual ? "" : " dados-abertos") + '" id="secao-' + (i + 1) + '" data-limite="12">' +
    '<div class="secao-head"><span class="secao-num">' + (i + 1) + '</span><h3 class="secao-titulo">' + escapeHtmlRelatorio(t.titulo || "Tabela " + (i + 1)) + '</h3><span class="contagem">' + qtd + (qtd === 1 ? " registro" : " registros") + "</span>" +
    '<div class="secao-tools">' + (rotuloChave ? '<span class="chip-filtro" hidden title="Remover filtro">Filtro: <span></span> ✕</span>' : "") +
    (qtd > 3 ? '<input type="search" class="filtro-input" placeholder="Filtrar nesta tabela..." aria-label="Filtrar ' + escapeHtmlRelatorio(t.titulo || "tabela") + '">' : "") +
    (visual ? '<button type="button" class="btn-mini btn-dados">Ver dados <span class="chev">⌄</span></button>' : "") +
    '<button type="button" class="btn-mini secao-toggle" aria-expanded="true" title="Recolher ou expandir"><span class="chev">▾</span></button></div></div>' +
    '<div class="secao-como-ler"><span class="i">i</span><span>' + escapeHtmlRelatorio(comoLer) + "</span></div>" +
    '<div class="secao-body">' + visual + relatorioVisualTabelaHtml(t, rotuloChave) + "</div></section>";
}

function gerarHTMLRelatorioVisualGenerico(r) {
  if (!r || !r.titulo) return "";
  var marca = marcaAtiva();
  var kpis = r.kpis || [], tabelas = r.tabelas || [];
  var totalRegistros = tabelas.reduce(function (s, t) { return s + ((t.dados || []).length); }, 0);
  var geradoEm = formatarDataBR(formatarDataISO(new Date()));
  var cls = relatorioVisualClassificarKpis(kpis);
  var diagIA = typeof iaDiagnosticarRelatorioCatalogo === "function" ? iaDiagnosticarRelatorioCatalogo(r) : null;
  var iaHtml = diagIA && typeof iaRenderizarCardInsightsHTML === "function" ? iaRenderizarCardInsightsHTML(diagIA, true) : "";
  var serie = relatorioVisualDadosSerie(tabelas), funil = relatorioVisualDadosFunil(tabelas);
  var cockpit = relatorioVisualCockpitHtml(r, cls, serie, funil);
  var glossario = cls.lista.filter(function (x) { return x.descricao; });
  var notas = relatorioVisualNotaEmItens(r.nota);
  var temMetodologia = glossario.length || notas.length;

  var capAutorais = {};
  (r.capitulos || []).forEach(function (c) { if (c && typeof c.antes === "number") capAutorais[c.antes] = c; });
  var numCap = 0, cap = function (titulo, desc, escuro) { numCap++; return relatorioVisualCapituloHtml((numCap < 10 ? "0" : "") + numCap, titulo, desc, escuro); };

  var sumario = '<a href="#visao-executiva">Visão executiva</a>' + (cockpit ? '<a href="#cockpit">Cockpit</a>' : "") + (iaHtml ? '<a href="#diagnostico-ia">Diagnóstico</a>' : "") +
    tabelas.map(function (t, i) { return '<a href="#secao-' + (i + 1) + '"><span class="n">' + (i + 1) + "</span>" + escapeHtmlRelatorio(relatorioVisualRotuloCurto(t.titulo || "Tabela " + (i + 1))) + "</a>"; }).join("") +
    (temMetodologia ? '<a href="#como-ler">Metodologia</a>' : "");

  var kpisHtml = kpis.length
    ? '<h2 class="titulo-secao" id="indicadores-complementares">Indicadores complementares</h2><p class="sub-secao">Abra este bloco quando precisar conferir todas as métricas da coorte. Passe o mouse para ler a definição; clique para copiar o valor.</p>' +
      '<button type="button" class="btn-gaveta" data-rotulo-fechado="Ver todos os ' + kpis.length + ' indicadores +">Ver todos os ' + kpis.length + ' indicadores +</button>' +
      '<div class="gaveta-kpis"><div class="painel">' + pontosDeAtencaoGenerico(kpis) + '<div class="kpis">' + cls.lista.slice(0, 4).map(function (x, i) { return relatorioVisualKpiHtml(x, i, true); }).join("") + "</div>" +
      (cls.lista.length > 4 ? '<div class="kpis kpis-sec">' + cls.lista.slice(4).map(function (x, i) { return relatorioVisualKpiHtml(x, i + 4, false); }).join("") + "</div>" : "") + "</div></div>"
    : "";

  var secoes = tabelas.map(function (t, i) {
    var a = capAutorais[i];
    var capHtml = a ? cap(a.titulo, a.descricao || "", numCap % 2 === 0) : (i === 0 ? cap("Análises detalhadas — gráfico primeiro, dados sob demanda.", tabelas.length + " análises. Em cada uma, o visual resume a tabela; o botão \"Ver dados\" abre a tabela completa para ordenar, filtrar e auditar.", true) : "");
    return capHtml + relatorioVisualSecaoHtml(t, i);
  }).join("");

  var partes = [
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtmlRelatorio(marca.nome) + " Intelligence | " + escapeHtmlRelatorio(r.titulo) + "</title>",
    "<style>" + relatorioVisualCss(marca) + "</style></head><body>",
    '<div class="letterhead"><div class="letterhead-inner"><div class="letterhead-brand">' + marca.logoSvg + '<div class="letterhead-divider"></div><div class="letterhead-tagline">' + escapeHtmlRelatorio(marca.tagline) + "</div></div>" +
      '<div class="letterhead-ref"><div class="ref"><strong>Relatório Comercial</strong>Extraído do Bitrix24 em ' + geradoEm + '</div><button type="button" class="btn-imprimir" title="Imprimir ou salvar em PDF">🖨 PDF</button></div></div></div>',
    relatorioVisualHeroHtml(r, cls, totalRegistros, geradoEm),
    '<nav class="sumario" aria-label="Sumário"><div class="sumario-inner">' + sumario + "</div></nav>",
    '<div class="wrap">',
    relatorioVisualBentoHtml(r, cls, diagIA, totalRegistros, geradoEm),
    kpisHtml,
    cockpit ? cap("Entenda o sistema antes do detalhe.", "Indicador principal, composição, tendência e funil reunidos num painel de leitura integrada. Clique em qualquer item para colocá-lo em foco.", true) + cockpit : "",
    iaHtml ? cap("Do número para a decisão.", "Os alertas abaixo não repetem KPIs: destacam o que merece investigação e deixam a evidência perto da recomendação.", false) + '<div id="diagnostico-ia" class="anima">' + iaHtml + "</div>" : "",
    tabelas.length ? secoes : '<p class="sub-secao">Sem tabelas neste relatório.</p>',
    temMetodologia ? cap("Metodologia e fórmulas.", "O que cada indicador responde, como é calculado e o que fica fora do denominador.", false) + '<div id="como-ler" class="painel anima">' +
      (glossario.length ? '<dl class="glossario">' + glossario.map(function (x) { return '<div class="glossario-item"><dt>' + escapeHtmlRelatorio(x.rotulo) + "</dt><dd>" + escapeHtmlRelatorio(x.descricao) + "</dd></div>"; }).join("") + "</dl>" : "") +
      (notas.length ? '<ul class="notas">' + notas.map(function (n) { return "<li>" + escapeHtmlRelatorio(n) + "</li>"; }).join("") + "</ul>" : "") + "</div>" : "",
    "</div>",
    '<button type="button" class="voltar-topo" title="Voltar ao topo" aria-label="Voltar ao topo">↑</button>',
    '<div class="theme-toggle" role="group" aria-label="Tema"><button type="button" data-theme-choice="light">Claro</button><button type="button" data-theme-choice="dark">Escuro</button><button type="button" data-theme-choice="system" class="active">Sistema</button></div>',
    '<footer><div class="footer-brand">' + marca.logoSvg + "<span>" + escapeHtmlRelatorio(marca.nome) + "</span></div>" + escapeHtmlRelatorio(marca.nome) + " · " + escapeHtmlRelatorio(r.titulo) + " · gerado em " + geradoEm + "</footer>",
    "<script>" + relatorioVisualJs() + "</script></body></html>"
  ];
  return partes.join("");
}
