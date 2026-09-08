// ---------------------------------------------------------------------------
// v41 — Modelo visual GENÉRICO dos relatórios (catálogo, Jornada, Diário SDR):
// gera um HTML autocontido (CSS + JS inline, sem dependência externa) a partir
// do resultado padrão { titulo, subtitulo, kpis[], tabelas[], nota }.
//
// Extraído de js/catalogo-relatorios.js "de passagem" (ver CLAUDE.md) ao
// redesenhar o layout: o anterior misturava gráfico e tabela num grid de 3
// colunas (.top3grid), o que embaralhava a leitura assim que a primeira
// tabela abria. Aqui cada tabela é uma seção inteira, com gráfico + tabela
// lado a lado, ordenação, filtro, "como ler" e glossário dos indicadores.
//
// Dependências globais (carregadas por outros <script> da página):
//   escapeHtmlRelatorio (jornada.js), marcaAtiva (config.js),
//   moedaRelatorio, formatarDataBR/formatarDataISO (bitrix-api.js),
//   iaDiagnosticarRelatorioCatalogo/iaRenderizarCardInsightsHTML (ia-engine.js, opcionais).
// ---------------------------------------------------------------------------

// Interpreta um texto já formatado ("R$ 1.513,87", "50.93%", "30 dias",
// "1.234", "—") como número, ou null quando não é numérico. Usada aqui (para
// marcar KPIs animáveis) e embutida via .toString() no JS do relatório
// exportado (ordenação das tabelas) — uma fonte só, testável no Node.
function relatorioVisualParseNumero(texto) {
  var s = String(texto == null ? "" : texto).trim();
  if (!s || s === "—" || s === "-") return null;
  var m = s.match(/^(?:R\$\s?)?(-?[\d.,]+)\s*(%|dias?|d|h|min)?$/i);
  if (!m) return null;
  var n = m[1];
  if (n.indexOf(".") > -1 && n.indexOf(",") > -1) n = n.replace(/\./g, "").replace(",", ".");
  else if (n.indexOf(",") > -1) n = n.replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(n)) n = n.replace(/\./g, "");
  var v = Number(n);
  return Number.isFinite(v) ? v : null;
}

// Decide se o valor de um KPI pode ser animado (contagem subindo até o valor
// final) e devolve os atributos data-* que o JS do relatório usa pra isso.
function relatorioVisualKpiAnimacao(valor) {
  var s = String(valor == null ? "" : valor).trim();
  var m;
  if ((m = s.match(/^R\$\s?(-?[\d.]+,\d{2})$/))) return { numero: relatorioVisualParseNumero(s), prefixo: "R$ ", sufixo: "", decimais: 2, milhar: 1 };
  if ((m = s.match(/^(-?\d+)(?:\.(\d+))?%$/))) return { numero: Number(m[1] + (m[2] ? "." + m[2] : "")), prefixo: "", sufixo: "%", decimais: m[2] ? m[2].length : 0, milhar: 0 };
  if ((m = s.match(/^(-?\d{1,3}(?:\.\d{3})+|-?\d+)$/))) return { numero: relatorioVisualParseNumero(s), prefixo: "", sufixo: "", decimais: 0, milhar: s.indexOf(".") > -1 ? 1 : 0 };
  if ((m = s.match(/^(\d+)\s+([a-zA-Zçãõ]+)$/))) return { numero: Number(m[1]), prefixo: "", sufixo: " " + m[2], decimais: 0, milhar: 0 };
  return null;
}

function relatorioVisualFormatarNumero(v, chave) {
  var n = Number(v) || 0;
  if (/VALOR|RECEITA|TICKET|PONDERAD|FATURA/i.test(chave || "")) return moedaRelatorio(n);
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function relatorioVisualRotuloBonito(chave) {
  return String(chave || "").replace(/_/g, " ").toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); });
}

// Escolhe automaticamente 1 coluna numérica (métrica) e 1 coluna de texto
// (rótulo) de QUALQUER tabela pra virar gráfico de barras — olha só os dados
// brutos (t.dados). Sem par óbvio, ou com um único rótulo distinto, não há
// gráfico (evita gráfico sem sentido).
var RELATORIO_VISUAL_CHAVES_ROTULO = ["CLIENTE", "RESPONSAVEL", "STATUS", "ESTAGIO", "FUNIL", "CANAL", "PIPELINE", "NOME", "ORIGEM", "PRODUTO", "SDR", "MES", "ETAPA", "SITUACAO", "TIPO", "RESULTADO", "CATEGORIA", "EMPRESA", "VENDEDOR", "MOTIVO", "FAIXA", "METRICA"];
var RELATORIO_VISUAL_CHAVES_METRICA = ["VALOR", "RECEITA", "ATIVIDADES", "NEGOCIOS", "LEADS", "QUANTIDADE", "TICKET", "GANHOS", "PERDIDOS", "TOTAL", "MEDIA_DIA", "VISITARAM", "PONDERADO", "DIAS", "PENDENTES", "ATRASADAS", "PASSARAM", "DECIDIDOS", "DEALS", "OPORTUNIDADES"];
function relatorioVisualDadosGrafico(t) {
  var dados = t && t.dados;
  if (!dados || dados.length < 2) return null;
  var chaves = Object.keys(dados[0] || {});
  var numericas = chaves.filter(function (k) { return !/(^|_)ID$/i.test(k) && dados.every(function (r) { return typeof r[k] === "number"; }); });
  if (!numericas.length) return null;
  var metrica = RELATORIO_VISUAL_CHAVES_METRICA.find(function (k) { return numericas.includes(k); }) || numericas[0];
  var textuais = chaves.filter(function (k) { return k !== metrica && !/(^|_)ID$/i.test(k) && dados.every(function (r) { return typeof r[k] === "string"; }); });
  if (!textuais.length) return null;
  var rotuloChave = RELATORIO_VISUAL_CHAVES_ROTULO.find(function (k) { return textuais.includes(k); }) || textuais[0];
  if (new Set(dados.map(function (r) { return r[rotuloChave]; })).size < 2) return null;
  var total = dados.reduce(function (s, r) { return s + (Number(r[metrica]) || 0); }, 0);
  if (total <= 0) return null;
  var linhas = dados.slice().sort(function (a, b) { return (Number(b[metrica]) || 0) - (Number(a[metrica]) || 0); }).slice(0, 8)
    .map(function (r) { return { ROTULO: r[rotuloChave] || "—", VALOR: Number(r[metrica]) || 0 }; });
  return { rotuloChave: rotuloChave, metrica: metrica, linhas: linhas, total: total, titulo: relatorioVisualRotuloBonito(metrica) + " por " + relatorioVisualRotuloBonito(rotuloChave).toLowerCase() };
}

// Quebra a nota metodológica (um parágrafo longo) em frases, pra virar lista.
function relatorioVisualNotaEmItens(nota) {
  var s = String(nota || "").trim();
  if (!s) return [];
  return s.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ("])/).map(function (x) { return x.trim(); }).filter(Boolean);
}

// Alertas automáticos: varre os KPIs à procura de padrões que sempre indicam
// algo que merece atenção (vencido, atrasado, fora do SLA, crítico...) —
// funciona em qualquer relatório sem lógica dedicada, só olhando rótulo+valor.
function pontosDeAtencaoGenerico(kpis) {
  var PADROES = /vencid|atrasad|sem atividade|sem closedate|sem clientedate|fora do sla|fora sla|cr[ií]tico|sem contato|pendente|não localizado/i;
  var achados = (kpis || []).filter(function (x) {
    var n = Number(String(x.valor).replace(/[^\d,.-]/g, "").replace(",", "."));
    return PADROES.test(x.rotulo || "") && Number.isFinite(n) && n > 0;
  });
  if (!achados.length) return "";
  var itens = achados.map(function (x) { return "<li><strong>" + escapeHtmlRelatorio(x.valor) + "</strong> — " + escapeHtmlRelatorio(x.rotulo) + "</li>"; }).join("");
  return '<div class="alerta anima"><span class="alerta-icone">⚠️</span><div><strong>Pontos de atenção encontrados neste relatório</strong><ul>' + itens + "</ul></div></div>";
}

function relatorioVisualCss(marca) {
  return String.raw`
  :root{--brand:${marca.corPrimaria};--brand-2:${marca.corSecundaria1};--brand-3:${marca.corSecundaria2};--gold:#FFC500;--ink:#2B2723;--ink-2:#5C564F;--muted:#8A8078;--line:#EAE1D8;--cream:#FBF3EC;--surface:#FFFFFF;--plane:#FAF9F7;--ok:#0F9D58;--warn:#E9A100;--bad:#D03B3B;--maxw:1240px;--radius:20px;--shadow:0 18px 40px -24px rgba(43,39,35,.28);--shadow-soft:0 8px 20px -14px rgba(43,39,35,.22)}
  *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:70px}[hidden]{display:none!important}
  body{margin:0;font-family:'Montserrat','Segoe UI',Arial,sans-serif;font-size:14px;color:var(--ink);background:linear-gradient(180deg,#FAF9F7 0%,#F3F0EA 100%) fixed;-webkit-font-smoothing:antialiased;padding-bottom:60px}
  a{color:var(--brand)}button{font-family:inherit}
  .anima{transition:opacity .55s ease,transform .55s cubic-bezier(.2,.8,.2,1)}html.anima-on .anima{opacity:0;transform:translateY(14px)}html.anima-on .anima.visivel{opacity:1;transform:none}
  .letterhead{background:var(--surface);border-bottom:3px solid var(--brand)}
  .letterhead-inner{max-width:var(--maxw);margin:0 auto;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .letterhead-brand{display:flex;align-items:center;gap:16px;min-width:0}.letterhead-brand svg{width:126px;height:auto;display:block}
  .letterhead-divider{width:1.5px;align-self:stretch;min-height:36px;background:var(--line)}
  .letterhead-tagline{font-size:10.5px;font-weight:800;letter-spacing:.055em;text-transform:uppercase;color:var(--ink-2);max-width:250px;line-height:1.45}
  .letterhead-ref{display:flex;align-items:center;gap:14px}
  .letterhead-ref .ref{font-size:11.5px;color:var(--muted);text-align:right;line-height:1.5}.letterhead-ref .ref strong{display:block;color:var(--ink);font-size:12.5px;font-weight:800}
  .btn-imprimir{border:1px solid var(--line);background:var(--surface);color:var(--brand);font-weight:800;font-size:12px;padding:9px 14px;border-radius:999px;cursor:pointer;transition:background .18s,transform .12s}.btn-imprimir:hover{background:var(--cream)}.btn-imprimir:active{transform:scale(.97)}
  .hero{position:relative;overflow:hidden;background:linear-gradient(115deg,var(--brand) 0%,var(--brand-3) 55%,var(--brand-2) 100%);color:#fff;padding:26px 24px 34px;clip-path:polygon(0 0,100% 0,100% 92%,0 100%)}
  .hero::after{content:"";position:absolute;right:-6%;top:-50%;width:520px;height:520px;background:radial-gradient(circle,rgba(255,255,255,.16) 0%,rgba(255,255,255,0) 70%);pointer-events:none}
  .hero-inner{max-width:var(--maxw);margin:0 auto;position:relative;z-index:1;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
  .hero-eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:800;opacity:.85;margin:0 0 8px}
  .hero h1{margin:0 0 6px;font-size:clamp(22px,2.8vw,30px);font-weight:800;line-height:1.15;letter-spacing:-.02em}
  .hero .subtitulo{margin:0;font-size:13px;opacity:.94;max-width:680px}
  .hero-chips{display:flex;gap:10px;flex-wrap:wrap}
  .chip{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.32);border-radius:14px;padding:8px 14px;min-width:96px;text-align:center}
  .chip strong{display:block;font-size:20px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}.chip span{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;opacity:.9}
  .sumario{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.9);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .sumario-inner{max-width:var(--maxw);margin:0 auto;padding:8px 24px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin}
  .sumario a{white-space:nowrap;text-decoration:none;color:var(--ink-2);font-size:11.5px;font-weight:800;padding:8px 12px;border-radius:999px;border:1px solid transparent;transition:background .18s,color .18s}
  .sumario a:hover{background:var(--cream);color:var(--brand)}.sumario a.ativo{background:var(--brand);color:#fff}
  .sumario a .n{display:inline-block;min-width:18px;height:18px;line-height:18px;border-radius:999px;background:var(--cream);color:var(--brand);font-size:10px;text-align:center;margin-right:6px}.sumario a.ativo .n{background:rgba(255,255,255,.25);color:#fff}
  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px}
  h2.titulo-secao{font-size:15px;font-weight:800;margin:34px 0 4px;padding-left:14px;position:relative;text-transform:uppercase;letter-spacing:.03em;display:flex;align-items:baseline;gap:10px}
  h2.titulo-secao::before{content:"";position:absolute;left:0;top:2px;bottom:2px;width:5px;border-radius:3px;background:linear-gradient(180deg,var(--brand),var(--gold))}
  p.sub-secao{margin:0 0 16px 19px;font-size:12.5px;color:var(--ink-2)}
  .painel{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:24px 26px}
  .alerta{display:flex;gap:12px;align-items:flex-start;background:#FFF8E6;border:1px solid #F5D98B;border-radius:14px;padding:14px 16px;margin-bottom:16px;font-size:12.5px}.alerta ul{margin:6px 0 0;padding-left:18px}.alerta-icone{font-size:18px}
  .kpis{display:flex;flex-wrap:wrap;gap:12px}
  .kpi{flex:1 1 180px;min-width:180px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px 18px;position:relative;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
  .kpi:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:var(--brand)}
  .kpi-destaque{flex:1 1 220px;background:linear-gradient(180deg,#fff 0%,var(--cream) 100%)}
  .kpi-destaque::before{content:"";position:absolute;left:18px;right:18px;top:0;height:3px;border-radius:0 0 3px 3px;background:linear-gradient(90deg,var(--brand),var(--gold))}
  .kpi-rotulo{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:800;color:var(--muted);margin-bottom:6px}
  .kpi-valor{font-size:24px;font-weight:800;color:var(--brand);letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.1}.kpi-destaque .kpi-valor{font-size:32px}
  .kpi-desc{margin-top:8px;font-size:11.5px;line-height:1.45;color:var(--ink-2)}
  .kpi::after{content:"Copiado ✓";position:absolute;right:12px;top:10px;background:var(--brand);color:#fff;font-size:10px;font-weight:800;padding:3px 8px;border-radius:8px;opacity:0;transform:translateY(-4px);transition:opacity .18s,transform .18s;pointer-events:none}.kpi.copiado::after{opacity:1;transform:none}
  .kpis-sec{margin-top:12px}
  .ia-insights-card{border:1px solid color-mix(in srgb,var(--brand) 30%,var(--line));border-radius:var(--radius);padding:20px 24px;background:color-mix(in srgb,var(--brand) 3%,#fff);box-shadow:var(--shadow-soft);margin:18px 0 0;position:relative;overflow:hidden}
  .ia-insights-card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand),var(--gold),#4774d9)}
  .ia-insights-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px}
  .ia-insights-badge{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--brand)}.ia-insights-badge .ia-sparkle{font-size:15px}
  .ia-insights-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
  .ia-insights-coluna{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px}
  .ia-insights-coluna h4{margin:0 0 10px;font-size:12px;font-weight:800}.ia-insights-coluna ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
  .ia-insights-coluna li{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.45}
  .ia-bullet{flex:0 0 18px;height:18px;border-radius:50%;font-size:10px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;color:#fff}.ia-bullet.ok{background:var(--ok)}.ia-bullet.alerta{background:var(--warn)}.ia-bullet.acao{background:var(--brand)}
  .secao{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:22px;overflow:hidden}
  .secao-head{display:flex;align-items:center;gap:12px;padding:16px 22px;background:var(--cream);border-bottom:1px solid var(--line);flex-wrap:wrap}
  .secao-num{flex:0 0 30px;width:30px;height:30px;border-radius:10px;background:var(--brand);color:#fff;font-weight:800;font-size:12px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 6px 14px -8px var(--brand)}
  .secao-titulo{font-size:15px;font-weight:800;margin:0;flex:1 1 auto;min-width:200px}
  .secao-head .contagem{font-size:11.5px;font-weight:700;color:var(--ink-2);background:#fff;border:1px solid var(--line);border-radius:999px;padding:5px 10px}
  .secao-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .filtro-input{border:1px solid var(--line);border-radius:999px;padding:7px 12px;font-size:12px;font-family:inherit;min-width:190px;background:#fff;outline:none;transition:border-color .18s,box-shadow .18s}.filtro-input:focus{border-color:var(--brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 18%,transparent)}
  .btn-mini{border:1px solid var(--line);background:#fff;color:var(--brand);font-weight:800;font-size:11.5px;padding:7px 12px;border-radius:999px;cursor:pointer;transition:background .18s}.btn-mini:hover{background:var(--cream)}
  .chip-filtro{display:inline-flex;align-items:center;gap:6px;background:var(--brand);color:#fff;font-size:11px;font-weight:800;border-radius:999px;padding:5px 10px;cursor:pointer}
  .secao.recolhida .secao-body{display:none}.secao-toggle .chev{display:inline-block;transition:transform .18s}.secao.recolhida .secao-toggle .chev{transform:rotate(-90deg)}
  .secao-como-ler{padding:10px 22px;font-size:12px;color:var(--ink-2);border-bottom:1px dashed var(--line);display:flex;gap:8px;align-items:flex-start;line-height:1.5}.secao-como-ler .i{flex:0 0 auto;color:var(--brand);font-weight:900}
  .secao-body{padding:18px 22px 22px;display:grid;gap:22px;grid-template-columns:1fr}
  .secao-body.com-grafico{grid-template-columns:minmax(260px,2fr) 3fr;align-items:start}
  .grafico-titulo{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:800;color:var(--muted);margin:0 0 12px;display:flex;justify-content:space-between;gap:8px}
  .barra-linha{display:grid;grid-template-columns:minmax(90px,38%) 1fr auto;align-items:center;gap:10px;padding:6px 8px;margin:0 -8px;border-radius:10px;cursor:pointer;transition:background .15s}
  .barra-linha:hover{background:var(--cream)}.barra-linha.ativa{background:color-mix(in srgb,var(--brand) 10%,#fff);outline:1px solid color-mix(in srgb,var(--brand) 35%,transparent)}
  .barra-rotulo{font-size:12px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .barra-track{height:12px;border-radius:999px;background:var(--plane);border:1px solid var(--line);overflow:hidden}
  .barra-fill{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,var(--brand),var(--brand-2));opacity:var(--o,1);transition:width .9s cubic-bezier(.2,.8,.2,1)}.visivel .barra-fill{width:var(--w)}
  .barra-valor{font-size:12px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}.barra-valor small{color:var(--muted);font-weight:600;margin-left:4px}
  .tabela-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px;max-height:560px}
  table.tabela{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px}
  table.tabela th{position:sticky;top:0;z-index:1;background:var(--cream);color:var(--ink-2);font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;font-weight:800;text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer;user-select:none;white-space:nowrap}
  table.tabela th:hover{color:var(--brand)}table.tabela th::after{content:"↕";margin-left:6px;opacity:.35;font-size:10px}table.tabela th[data-ordem="asc"]::after{content:"↑";opacity:1;color:var(--brand)}table.tabela th[data-ordem="desc"]::after{content:"↓";opacity:1;color:var(--brand)}
  table.tabela td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:middle}table.tabela tbody tr:nth-child(even) td{background:#FCFAF7}table.tabela tbody tr:hover td{background:var(--cream)}
  table.tabela td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  table.tabela td.pct{background-image:linear-gradient(90deg,color-mix(in srgb,var(--brand) 16%,transparent) var(--pct),transparent var(--pct));background-repeat:no-repeat;font-weight:700}
  table.tabela tr[hidden]{display:none}
  .tabela-rodape{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;font-size:11.5px;color:var(--muted)}
  .glossario{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
  .glossario-item{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
  .glossario-item dt{font-size:12px;font-weight:800;color:var(--brand);margin:0 0 4px}.glossario-item dd{margin:0;font-size:12px;line-height:1.5;color:var(--ink-2)}
  .notas{margin:14px 0 0;padding-left:20px;font-size:12.5px;line-height:1.6;color:var(--ink-2)}.notas li{margin-bottom:6px}.notas li::marker{color:var(--brand)}
  .voltar-topo{position:fixed;right:22px;bottom:22px;width:44px;height:44px;border-radius:50%;background:var(--brand);color:#fff;border:none;font-size:18px;cursor:pointer;box-shadow:0 12px 26px -10px var(--brand);opacity:0;transform:translateY(10px);transition:opacity .2s,transform .2s;z-index:30}.voltar-topo.visivel{opacity:1;transform:none}
  footer{max-width:var(--maxw);margin:36px auto 0;padding:22px 24px 0;border-top:1px solid var(--line);text-align:center;font-size:11.5px;color:var(--muted)}
  .footer-brand{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px}.footer-brand svg{height:15px;width:auto}.footer-brand span{font-weight:800;color:var(--ink);letter-spacing:.04em}
  @media (max-width:900px){.secao-body.com-grafico{grid-template-columns:1fr}.letterhead-tagline,.letterhead-divider{display:none}.hero-inner{align-items:flex-start}}
  @media (max-width:620px){.wrap,.letterhead-inner,.sumario-inner{padding-left:14px;padding-right:14px}.painel{padding:18px}.kpi-destaque .kpi-valor{font-size:26px}}
  @media (prefers-reduced-motion:reduce){.anima{opacity:1;transform:none;transition:none}.barra-fill{transition:none;width:var(--w)}}
  @media print{body{background:#fff;padding:0}.sumario,.voltar-topo,.btn-imprimir,.secao-tools,.tabela-rodape,.filtro-input{display:none!important}.anima{opacity:1;transform:none}.barra-fill{width:var(--w)}.secao,.painel,.kpi{box-shadow:none;break-inside:avoid}.secao.recolhida .secao-body{display:grid}.tabela-wrap{max-height:none;overflow:visible}table.tabela tr[hidden]{display:table-row}.hero{clip-path:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  `;
}

function relatorioVisualJs() {
  return String.raw`
  (function(){
    var reduz=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var parseNumero=${relatorioVisualParseNumero.toString()};

    var animados=document.querySelectorAll('.anima');
    if('IntersectionObserver' in window&&!reduz){
      document.documentElement.classList.add('anima-on');
      var io=new IntersectionObserver(function(entradas){entradas.forEach(function(e){if(e.isIntersecting){e.target.classList.add('visivel');io.unobserve(e.target);}});},{threshold:.1});
      animados.forEach(function(el){io.observe(el);});
      setTimeout(function(){animados.forEach(function(el){el.classList.add('visivel');});},2500);
    }

    document.querySelectorAll('.kpi-valor[data-numero]').forEach(function(el){
      var alvo=parseFloat(el.getAttribute('data-numero'));var textoFinal=el.textContent;
      if(!isFinite(alvo)||reduz)return;
      var prefixo=el.getAttribute('data-prefixo')||'',sufixo=el.getAttribute('data-sufixo')||'';
      var dec=parseInt(el.getAttribute('data-decimais')||'0',10),milhar=el.getAttribute('data-milhar')==='1';
      var ini=null,dur=1000;
      function fmt(v){return prefixo+(milhar?v.toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec}):v.toFixed(dec))+sufixo;}
      function passo(ts){if(ini===null)ini=ts;var p=Math.min(1,(ts-ini)/dur);var e=1-Math.pow(1-p,3);el.textContent=fmt(alvo*e);if(p<1)requestAnimationFrame(passo);else el.textContent=textoFinal;}
      requestAnimationFrame(passo);
    });

    document.querySelectorAll('.kpi').forEach(function(card){
      card.addEventListener('click',function(){
        var texto=(card.querySelector('.kpi-rotulo')||{}).textContent+': '+(card.querySelector('.kpi-valor')||{}).textContent;
        var ok=function(){card.classList.add('copiado');clearTimeout(card._t);card._t=setTimeout(function(){card.classList.remove('copiado');},1500);};
        if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(texto).then(ok,ok);}else{ok();}
      });
    });

    function aplicarFiltros(secao){
      var table=secao.querySelector('table.tabela');if(!table)return;
      var campo=secao.querySelector('.filtro-input');var termo=campo?campo.value.trim().toLowerCase():'';
      var barra=secao.getAttribute('data-filtro-barra')||'';
      var todas=secao.classList.contains('mostrar-todas');
      var limite=parseInt(secao.getAttribute('data-limite')||'12',10);
      var visiveis=0,total=0;
      Array.prototype.forEach.call(table.tBodies[0].rows,function(tr){
        var ok=(!termo||tr.textContent.toLowerCase().indexOf(termo)>-1)&&(!barra||tr.getAttribute('data-rotulo')===barra);
        if(ok){total++;var mostrar=todas||visiveis<limite;tr.hidden=!mostrar;if(mostrar)visiveis++;}else{tr.hidden=true;}
      });
      var cont=secao.querySelector('.contagem');if(cont)cont.textContent=visiveis+' de '+total+' registro(s)';
      var btn=secao.querySelector('.btn-todas');if(btn){btn.hidden=todas||total<=limite;btn.textContent='Mostrar todas ('+total+')';}
      var chip=secao.querySelector('.chip-filtro');if(chip){chip.hidden=!barra;var sp=chip.querySelector('span');if(sp)sp.textContent=barra;}
      secao.querySelectorAll('.barra-linha').forEach(function(b){b.classList.toggle('ativa',!!barra&&b.getAttribute('data-rotulo')===barra);});
    }

    document.querySelectorAll('.secao').forEach(function(secao){
      var table=secao.querySelector('table.tabela');
      if(table){
        Array.prototype.forEach.call(table.tBodies[0].rows,function(tr){
          Array.prototype.forEach.call(tr.cells,function(td){
            var t=td.textContent.trim();var n=parseNumero(t);
            if(n!==null){td.classList.add('num');}
            if(/^-?\d+(\.\d+)?%$/.test(t)){td.classList.add('pct');td.style.setProperty('--pct',Math.max(0,Math.min(100,n))+'%');}
          });
        });
        Array.prototype.forEach.call(table.tHead.rows[0].cells,function(th,idx){
          th.title='Clique para ordenar';
          th.addEventListener('click',function(){
            var asc=th.getAttribute('data-ordem')!=='asc';
            Array.prototype.forEach.call(table.tHead.rows[0].cells,function(o){o.removeAttribute('data-ordem');});
            th.setAttribute('data-ordem',asc?'asc':'desc');
            var tbody=table.tBodies[0],linhas=Array.prototype.slice.call(tbody.rows);
            linhas.sort(function(a,b){
              var ta=a.cells[idx]?a.cells[idx].textContent.trim():'',tb=b.cells[idx]?b.cells[idx].textContent.trim():'';
              var na=parseNumero(ta),nb=parseNumero(tb),r;
              if(na!==null&&nb!==null)r=na-nb;else if(na!==null)r=-1;else if(nb!==null)r=1;else r=ta.localeCompare(tb,'pt-BR');
              return asc?r:-r;
            });
            linhas.forEach(function(l){tbody.appendChild(l);});
            aplicarFiltros(secao);
          });
        });
      }
      var campo=secao.querySelector('.filtro-input');if(campo)campo.addEventListener('input',function(){secao.classList.remove('mostrar-todas');aplicarFiltros(secao);});
      var btn=secao.querySelector('.btn-todas');if(btn)btn.addEventListener('click',function(){secao.classList.add('mostrar-todas');aplicarFiltros(secao);});
      var chip=secao.querySelector('.chip-filtro');if(chip)chip.addEventListener('click',function(){secao.removeAttribute('data-filtro-barra');aplicarFiltros(secao);});
      secao.querySelectorAll('.barra-linha').forEach(function(b){
        b.addEventListener('click',function(){
          var r=b.getAttribute('data-rotulo');
          if(secao.getAttribute('data-filtro-barra')===r)secao.removeAttribute('data-filtro-barra');else secao.setAttribute('data-filtro-barra',r);
          secao.classList.remove('mostrar-todas');aplicarFiltros(secao);
        });
      });
      var toggle=secao.querySelector('.secao-toggle');if(toggle)toggle.addEventListener('click',function(){secao.classList.toggle('recolhida');toggle.setAttribute('aria-expanded',secao.classList.contains('recolhida')?'false':'true');});
      aplicarFiltros(secao);
    });

    var links=Array.prototype.slice.call(document.querySelectorAll('.sumario a'));
    var alvos=links.map(function(a){return document.querySelector(a.getAttribute('href'));}).filter(Boolean);
    function marcarAtivo(){
      var y=window.scrollY+90,atual=alvos[0];
      alvos.forEach(function(el){if(el.offsetTop<=y)atual=el;});
      links.forEach(function(a){a.classList.toggle('ativo',atual&&a.getAttribute('href')==='#'+atual.id);});
      var topo=document.querySelector('.voltar-topo');if(topo)topo.classList.toggle('visivel',window.scrollY>400);
    }
    window.addEventListener('scroll',marcarAtivo,{passive:true});marcarAtivo();
    var topo=document.querySelector('.voltar-topo');if(topo)topo.addEventListener('click',function(){window.scrollTo({top:0,behavior:reduz?'auto':'smooth'});});
    var imprimir=document.querySelector('.btn-imprimir');if(imprimir)imprimir.addEventListener('click',function(){window.print();});
  })();
  `;
}

function relatorioVisualKpiHtml(x, i, destaque) {
  var anim = relatorioVisualKpiAnimacao(x.valor);
  var attrs = anim ? ' data-numero="' + anim.numero + '" data-prefixo="' + escapeHtmlRelatorio(anim.prefixo) + '" data-sufixo="' + escapeHtmlRelatorio(anim.sufixo) + '" data-decimais="' + anim.decimais + '" data-milhar="' + anim.milhar + '"' : "";
  return '<div class="kpi' + (destaque ? " kpi-destaque" : "") + ' anima" style="transition-delay:' + (i * 45) + 'ms" title="Clique para copiar">' +
    '<div class="kpi-rotulo">' + escapeHtmlRelatorio(x.rotulo) + "</div>" +
    '<div class="kpi-valor"' + attrs + ">" + escapeHtmlRelatorio(x.valor) + "</div>" +
    (x.descricao ? '<div class="kpi-desc">' + escapeHtmlRelatorio(x.descricao) + "</div>" : "") +
    "</div>";
}

function relatorioVisualGraficoHtml(g, chaveValor) {
  if (!g) return "";
  var max = Math.max(1, g.linhas[0] ? g.linhas[0].VALOR : 1);
  var linhas = g.linhas.map(function (x, i) {
    var w = Math.max(2, (x.VALOR / max) * 100).toFixed(1);
    var part = g.total ? ((x.VALOR / g.total) * 100).toFixed(1) : "0.0";
    var opacidade = (1 - Math.min(i, 7) * 0.08).toFixed(2);
    return '<div class="barra-linha" data-rotulo="' + escapeHtmlRelatorio(x.ROTULO) + '" title="' + escapeHtmlRelatorio(x.ROTULO) + ": " + escapeHtmlRelatorio(relatorioVisualFormatarNumero(x.VALOR, chaveValor)) + " (" + part + '% do total) — clique para filtrar a tabela">' +
      '<div class="barra-rotulo">' + escapeHtmlRelatorio(x.ROTULO) + "</div>" +
      '<div class="barra-track"><div class="barra-fill" style="--w:' + w + "%;--o:" + opacidade + '"></div></div>' +
      '<div class="barra-valor">' + escapeHtmlRelatorio(relatorioVisualFormatarNumero(x.VALOR, chaveValor)) + "<small>" + part + "%</small></div></div>";
  }).join("");
  return '<div class="grafico"><p class="grafico-titulo"><span>' + escapeHtmlRelatorio(g.titulo) + "</span><span>top " + g.linhas.length + "</span></p>" + linhas + "</div>";
}

function relatorioVisualTabelaHtml(t, g) {
  var colunas = (t.colunas || []).map(function (c) {
    return { label: c.label, valor: typeof c.valor === "function" ? c.valor : function (row) { return row[c.valor]; }, html: !!c.html };
  });
  var dados = (t.dados || []).slice(0, t.limite || 300);
  var thead = "<tr>" + colunas.map(function (c) { return "<th>" + escapeHtmlRelatorio(c.label) + "</th>"; }).join("") + "</tr>";
  var tbody = dados.map(function (row) {
    var rotulo = g ? ' data-rotulo="' + escapeHtmlRelatorio(row[g.rotuloChave] == null || row[g.rotuloChave] === "" ? "—" : row[g.rotuloChave]) + '"' : "";
    return "<tr" + rotulo + ">" + colunas.map(function (c) { var v = c.valor(row); return "<td>" + (c.html ? v : escapeHtmlRelatorio(v == null ? "" : v)) + "</td>"; }).join("") + "</tr>";
  }).join("");
  return '<div><div class="tabela-wrap"><table class="tabela"><thead>' + thead + "</thead><tbody>" + tbody + "</tbody></table></div>" +
    '<div class="tabela-rodape"><span>Clique no cabeçalho para ordenar' + (g ? " · clique numa barra do gráfico para filtrar" : "") + '</span><button type="button" class="btn-mini btn-todas" hidden>Mostrar todas</button></div></div>';
}

function relatorioVisualSecaoHtml(t, i) {
  var g = relatorioVisualDadosGrafico(t);
  var qtd = (t.dados || []).length;
  var colunas = (t.colunas || []).map(function (c) { return c.label; });
  var comoLer = t.descricao ? escapeHtmlRelatorio(t.descricao) :
    "Cada linha é um registro" + (colunas.length ? " com " + colunas.length + " coluna(s): " + escapeHtmlRelatorio(colunas.join(", ")) : "") + "." +
    (g ? " O gráfico mostra os " + g.linhas.length + " maiores por " + escapeHtmlRelatorio(relatorioVisualRotuloBonito(g.metrica).toLowerCase()) + " e a participação de cada um no total." : "");
  return '<section class="secao anima" id="secao-' + (i + 1) + '" data-limite="12">' +
    '<div class="secao-head"><span class="secao-num">' + (i + 1) + "</span>" +
    '<h3 class="secao-titulo">' + escapeHtmlRelatorio(t.titulo || "Tabela " + (i + 1)) + "</h3>" +
    '<span class="contagem">' + qtd + " registro(s)</span>" +
    '<div class="secao-tools">' +
    (g ? '<span class="chip-filtro" hidden title="Remover filtro">Filtro: <span></span> ✕</span>' : "") +
    (qtd > 3 ? '<input type="search" class="filtro-input" placeholder="Filtrar nesta tabela..." aria-label="Filtrar ' + escapeHtmlRelatorio(t.titulo || "tabela") + '">' : "") +
    '<button type="button" class="btn-mini secao-toggle" aria-expanded="true" title="Recolher ou expandir"><span class="chev">▾</span></button></div></div>' +
    '<div class="secao-como-ler"><span class="i">ⓘ</span><span>' + comoLer + "</span></div>" +
    '<div class="secao-body' + (g ? " com-grafico" : "") + '">' + relatorioVisualGraficoHtml(g, g && g.metrica) + relatorioVisualTabelaHtml(t, g) + "</div></section>";
}

function gerarHTMLRelatorioVisualGenerico(r) {
  if (!r || !r.titulo) return "";
  var marca = marcaAtiva();
  var kpis = r.kpis || [];
  var tabelas = r.tabelas || [];
  var totalRegistros = tabelas.reduce(function (s, t) { return s + ((t.dados || []).length); }, 0);
  var geradoEm = formatarDataBR(formatarDataISO(new Date()));
  var subtitulo = String(r.subtitulo || "").replace(/<[^>]+>/g, "") || "Extraído automaticamente pelo portal " + escapeHtmlRelatorio(marca.nome) + ".";

  var diagIA = typeof iaDiagnosticarRelatorioCatalogo === "function" ? iaDiagnosticarRelatorioCatalogo(r) : null;
  var iaHtml = diagIA && typeof iaRenderizarCardInsightsHTML === "function" ? iaRenderizarCardInsightsHTML(diagIA, true) : "";

  var destaque = kpis.slice(0, 4).map(function (x, i) { return relatorioVisualKpiHtml(x, i, true); }).join("");
  var secundarios = kpis.slice(4).map(function (x, i) { return relatorioVisualKpiHtml(x, i + 4, false); }).join("");
  var glossario = kpis.filter(function (x) { return x.descricao; });
  var notas = relatorioVisualNotaEmItens(r.nota);

  var sumario = '<a href="#visao-geral">Visão geral</a>' +
    (iaHtml ? '<a href="#diagnostico-ia">Diagnóstico IA</a>' : "") +
    tabelas.map(function (t, i) { return '<a href="#secao-' + (i + 1) + '"><span class="n">' + (i + 1) + "</span>" + escapeHtmlRelatorio(t.titulo || "Tabela " + (i + 1)) + "</a>"; }).join("") +
    (glossario.length || notas.length ? '<a href="#como-ler">Como ler</a>' : "");

  return "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + escapeHtmlRelatorio(r.titulo) + " · " + escapeHtmlRelatorio(marca.nome) + "</title><style>" + relatorioVisualCss(marca) + "</style></head><body>" +
    '<div class="letterhead"><div class="letterhead-inner"><div class="letterhead-brand">' + marca.logoSvg + '<div class="letterhead-divider"></div><div class="letterhead-tagline">' + escapeHtmlRelatorio(marca.tagline) + "</div></div>" +
    '<div class="letterhead-ref"><div class="ref"><strong>Relatório Comercial</strong>Extraído do Bitrix24 em ' + geradoEm + '</div><button type="button" class="btn-imprimir" title="Imprimir ou salvar em PDF">🖨 PDF</button></div></div></div>' +
    '<header class="hero"><div class="hero-inner"><div><p class="hero-eyebrow">Relatório Comercial · Bitrix24</p><h1>' + escapeHtmlRelatorio(r.titulo) + '</h1><p class="subtitulo">' + subtitulo + "</p></div>" +
    '<div class="hero-chips"><div class="chip"><strong>' + kpis.length + "</strong><span>indicadores</span></div><div class=\"chip\"><strong>" + tabelas.length + "</strong><span>seções</span></div><div class=\"chip\"><strong>" + totalRegistros.toLocaleString("pt-BR") + "</strong><span>registros</span></div></div></div></header>" +
    '<nav class="sumario" aria-label="Sumário"><div class="sumario-inner">' + sumario + "</div></nav>" +
    '<div class="wrap">' +
    '<h2 class="titulo-secao" id="visao-geral">Visão geral</h2><p class="sub-secao">Indicadores calculados sobre o período do relatório. Passe o mouse para ler a definição; clique para copiar o valor.</p>' +
    '<div class="painel">' + pontosDeAtencaoGenerico(kpis) +
    (kpis.length ? '<div class="kpis">' + destaque + "</div>" + (secundarios ? '<div class="kpis kpis-sec">' + secundarios + "</div>" : "") : '<p class="sub-secao" style="margin:0">Sem indicadores neste relatório.</p>') + "</div>" +
    (iaHtml ? '<div id="diagnostico-ia" class="anima">' + iaHtml + "</div>" : "") +
    '<h2 class="titulo-secao">Detalhamento <span style="font-size:11px;font-weight:600;color:var(--muted);text-transform:none;letter-spacing:0">' + tabelas.length + " seção(ões)</span></h2><p class=\"sub-secao\">Cada seção traz gráfico e tabela interativos — ordene, filtre e recolha o que não precisar.</p>" +
    (tabelas.length ? tabelas.map(relatorioVisualSecaoHtml).join("") : '<p class="sub-secao">Sem tabelas neste relatório.</p>') +
    (glossario.length || notas.length ? '<h2 class="titulo-secao" id="como-ler">Como ler este relatório</h2><p class="sub-secao">Definição de cada indicador e as regras de cálculo usadas.</p><div class="painel anima">' +
      (glossario.length ? '<dl class="glossario">' + glossario.map(function (x) { return '<div class="glossario-item"><dt>' + escapeHtmlRelatorio(x.rotulo) + "</dt><dd>" + escapeHtmlRelatorio(x.descricao) + "</dd></div>"; }).join("") + "</dl>" : "") +
      (notas.length ? '<ul class="notas">' + notas.map(function (n) { return "<li>" + escapeHtmlRelatorio(n) + "</li>"; }).join("") + "</ul>" : "") + "</div>" : "") +
    "</div>" +
    '<button type="button" class="voltar-topo" title="Voltar ao topo" aria-label="Voltar ao topo">↑</button>' +
    '<footer><div class="footer-brand">' + marca.logoSvg + "<span>" + escapeHtmlRelatorio(marca.nome) + "</span></div>" + escapeHtmlRelatorio(marca.nome) + " · " + escapeHtmlRelatorio(r.titulo) + " · gerado em " + geradoEm + "</footer>" +
    "<script>" + relatorioVisualJs() + "</script></body></html>";
}
