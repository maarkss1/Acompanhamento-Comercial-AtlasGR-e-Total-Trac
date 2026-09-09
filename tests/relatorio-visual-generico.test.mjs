// Modelo visual genérico (js/relatorio-visual-generico.js + runtime): o HTML
// exportado é montado por string a partir de { titulo, kpis, tabelas, nota }.
// Aqui garantimos as heurísticas puras (parse de número formatado, animação
// de KPI, classificação/composição dos KPIs, tipo de visual por tabela,
// funil/série do cockpit) e a estrutura do documento (hero+placar, bento,
// cockpit, uma seção por tabela, metodologia, escape de HTML), sem navegador.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, "..");
const bitrix = carregarScriptClassico(path.join(RAIZ, "js", "bitrix-api.js"));
const escapeHtmlRelatorio = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const marca = { nome: "AtlasGR", tagline: "Gerenciamento de Risco", corPrimaria: "#FF5618", corSecundaria1: "#FF8008", corSecundaria2: "#FF6B10", logoSvg: "<svg data-logo></svg>" };
const comum = {
  ...bitrix,
  escapeHtmlRelatorio,
  marcaAtiva: () => marca,
  moedaRelatorio: (n) => "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  formatarDataBR: (iso) => String(iso).split("-").reverse().join("/"),
};
const mod = carregarScriptClassico(path.join(RAIZ, "js", "relatorio-visual-generico.js"), { contextoExtra: comum });
// runtime (CSS/JS embutidos) vive em outro contexto vm — o JS embutido
// serializa relatorioVisualParseNumero do gerador via .toString().
const runtime = carregarScriptClassico(path.join(RAIZ, "js", "relatorio-visual-runtime.js"), { contextoExtra: { ...comum, relatorioVisualParseNumero: mod.relatorioVisualParseNumero } });
mod.relatorioVisualCss = runtime.relatorioVisualCss;
mod.relatorioVisualJs = runtime.relatorioVisualJs;

const kpi = (rotulo, valor, descricao) => (descricao ? { rotulo, valor, descricao } : { rotulo, valor });
function fixture() {
  return {
    chave: "conversao_comercial",
    titulo: "Conversão Comercial • funil e Win Rate <script>alert(1)</script>",
    subtitulo: "Coorte criada entre <strong>2026-01-01</strong> e <strong>2026-09-08</strong>.",
    kpis: [
      kpi("Oportunidades", 298, "Todo negócio criado no período."),
      kpi("Ganhos", 110, "Contrato assinado no Financeiro."),
      kpi("Perdas", 106),
      kpi("Em aberto", 70),
      kpi("Piloto (em teste)", 12),
      kpi("Win Rate (fechados)", "50.93%", "Ganhos ÷ (Ganhos + Perdas)."),
      kpi("Receita ganha", "R$ 166.526,00", "Soma do valor dos Ganhos."),
      kpi("Ciclo médio", "30 dias"),
    ],
    tabelas: [
      { titulo: "Funil de conversão — avanço por etapa", dados: [
        { ETAPA: "Nova Oportunidade", PASSARAM: 293, AVANCOU: 152, TAXA_AVANCO_PCT: 51.88, QUEDA: 141 },
        { ETAPA: "Proposta Enviada", PASSARAM: 155, AVANCOU: 19, TAXA_AVANCO_PCT: 12.26, QUEDA: 136 },
        { ETAPA: "Negócios Ganhos", PASSARAM: 142, AVANCOU: 3, TAXA_AVANCO_PCT: 2.11, QUEDA: 139 },
      ], colunas: [{ label: "Etapa", valor: "ETAPA" }, { label: "Passaram", valor: "PASSARAM" }, { label: "Taxa de avanço", valor: (x) => `${x.TAXA_AVANCO_PCT}%` }] },
      { titulo: "Win Rate por vendedor", descricao: "Compare Win Rate com volume decidido.", dados: [
        { RESPONSAVEL: "Ana", DECIDIDOS: 40, GANHOS: 30, WIN_RATE_PCT: 75, RECEITA: 1000 },
        { RESPONSAVEL: "Bruno", DECIDIDOS: 25, GANHOS: 10, WIN_RATE_PCT: 40, RECEITA: 500 },
        { RESPONSAVEL: "Carla", DECIDIDOS: 2, GANHOS: 2, WIN_RATE_PCT: 100, RECEITA: 90 },
      ], colunas: [{ label: "Responsável", valor: "RESPONSAVEL" }, { label: "Decididos", valor: "DECIDIDOS" }, { label: "Win Rate", valor: (x) => `${x.WIN_RATE_PCT}%` }, { label: "Receita", valor: (x) => "R$ " + x.RECEITA, html: true }] },
      { titulo: "Comparativo — período anterior", dados: [{ METRICA: "Ganhos", ATUAL: "110", ANTERIOR: "84", DELTA: "+26" }], colunas: [{ label: "Métrica", valor: "METRICA" }, { label: "Atual", valor: "ATUAL" }, { label: "Período anterior", valor: "ANTERIOR" }, { label: "Δ", valor: "DELTA" }] },
      { titulo: "Tendência do Win Rate — últimos 12 meses", dados: Array.from({ length: 12 }, (_, i) => ({ MES: `2026-${String(i + 1).padStart(2, "0")}`, OPORTUNIDADES: 20 + i, GANHOS: 5 + i, PERDAS: 5, WIN_RATE_PCT: Number(((5 + i) / (10 + i) * 100).toFixed(2)) })), colunas: [{ label: "Mês", valor: "MES" }, { label: "Ganhos", valor: "GANHOS" }, { label: "Win Rate", valor: (x) => `${x.WIN_RATE_PCT}%` }] },
      { titulo: "Ciclo de vendas — distribuição", dados: [{ FAIXA: "0–15 dias", NEGOCIOS: 126, PARTICIPACAO_PCT: 58.33 }, { FAIXA: "16–30 dias", NEGOCIOS: 21, PARTICIPACAO_PCT: 9.72 }, { FAIXA: "90+ dias", NEGOCIOS: 69, PARTICIPACAO_PCT: 31.95 }], colunas: [{ label: "Faixa", valor: "FAIXA" }, { label: "Negócios", valor: "NEGOCIOS" }, { label: "%", valor: (x) => `${x.PARTICIPACAO_PCT}%` }] },
      { titulo: "Sem gráfico (um rótulo só)", dados: [{ NOME: "X", TOTAL: 1 }, { NOME: "X", TOTAL: 2 }], colunas: [{ label: "Nome", valor: "NOME" }, { label: "Total", valor: "TOTAL" }] },
    ],
    capitulos: [{ antes: 1, titulo: "Quem vende.", descricao: "Leitura por vendedor." }],
    nota: "Ganho = contrato assinado no Financeiro. Piloto fica fora de \"Em aberto\" de propósito (é etapa de teste). A Tendência é sempre fixa.",
  };
}

describe("relatorioVisualParseNumero — texto formatado → número", () => {
  test("moeda pt-BR, percentual, inteiro com milhar, 'N dias' e p.p.", () => {
    assert.equal(mod.relatorioVisualParseNumero("R$ 1.513,87"), 1513.87);
    assert.equal(mod.relatorioVisualParseNumero("50.93%"), 50.93);
    assert.equal(mod.relatorioVisualParseNumero("1.234"), 1234);
    assert.equal(mod.relatorioVisualParseNumero("298"), 298);
    assert.equal(mod.relatorioVisualParseNumero("30 dias"), 30);
    assert.equal(mod.relatorioVisualParseNumero("+4.52 p.p."), 4.52);
    assert.equal(mod.relatorioVisualParseNumero("-12,5"), -12.5);
  });
  test("texto, vazio e travessão não são número", () => {
    assert.equal(mod.relatorioVisualParseNumero("Ana"), null);
    assert.equal(mod.relatorioVisualParseNumero("—"), null);
    assert.equal(mod.relatorioVisualParseNumero(""), null);
    assert.equal(mod.relatorioVisualParseNumero("2026-05"), null);
  });
});

describe("relatorioVisualKpiAnimacao — atributos de contagem animada", () => {
  test("moeda, percentual (mantém casas decimais) e valor não numérico", () => {
    const a = mod.relatorioVisualKpiAnimacao("R$ 166.526,00");
    assert.equal(a.numero, 166526); assert.equal(a.prefixo, "R$ "); assert.equal(a.decimais, 2);
    const b = mod.relatorioVisualKpiAnimacao("50.93%");
    assert.equal(b.numero, 50.93); assert.equal(b.sufixo, "%"); assert.equal(b.decimais, 2);
    assert.equal(mod.relatorioVisualKpiAnimacao("—"), null);
    assert.equal(mod.relatorioVisualKpiAnimacao("Ana Silva"), null);
  });
});

describe("relatorioVisualClassificarKpis — principal, receita e composição", () => {
  test("principal é o primeiro percentual; receita o primeiro R$", () => {
    const c = mod.relatorioVisualClassificarKpis(fixture().kpis);
    assert.equal(c.primario.rotulo, "Win Rate (fechados)");
    assert.equal(c.moeda.rotulo, "Receita ganha");
    assert.equal(c.contagens.length, 5);
  });
  test("composição: contagens que somam exatamente a primeira (298 = 110+106+70+12)", () => {
    const c = mod.relatorioVisualClassificarKpis(fixture().kpis);
    assert.equal(c.composicao.base.rotulo, "Oportunidades");
    assert.deepEqual(c.composicao.partes.map((k) => k.rotulo), ["Ganhos", "Perdas", "Em aberto", "Piloto (em teste)"]);
  });
  test("sem soma que feche não há composição; sem KPIs nada quebra", () => {
    assert.equal(mod.relatorioVisualClassificarKpis([kpi("A", 10), kpi("B", 3), kpi("C", 4)]).composicao, null);
    const vazio = mod.relatorioVisualClassificarKpis([]);
    assert.equal(vazio.primario, null); assert.equal(vazio.lista.length, 0);
  });
});

describe("relatorioVisualTipoVisual — escolhe o visual pela forma da tabela", () => {
  const t = fixture().tabelas;
  test("etapa × volume vira barras; atual/anterior vira comparativo", () => {
    assert.equal(mod.relatorioVisualTipoVisual(t[0]).tipo, "barras");
    assert.equal(mod.relatorioVisualTipoVisual(t[2]).tipo, "comparativo");
  });
  test("série mensal vira tendência com percentual e volume = ganhos + perdas", () => {
    const tv = mod.relatorioVisualTipoVisual(t[3]);
    assert.equal(tv.tipo, "tendencia"); assert.equal(tv.mesChave, "MES"); assert.equal(tv.yChave, "WIN_RATE_PCT"); assert.equal(tv.ehPct, true);
    assert.equal(tv.ganhosChave, "GANHOS"); assert.equal(tv.perdasChave, "PERDAS");
  });
  test("poucas faixas com % vira distribuição; rótulo único não tem visual", () => {
    const d = mod.relatorioVisualTipoVisual(t[4]);
    assert.equal(d.tipo, "distribuicao"); assert.equal(d.pctChave, "PARTICIPACAO_PCT"); assert.equal(d.contagemChave, "NEGOCIOS");
    assert.equal(mod.relatorioVisualTipoVisual(t[5]).tipo, null);
  });
  test("barras: prioriza chaves conhecidas, ordena do maior pro menor e ignora colunas _PCT como métrica", () => {
    const g = mod.relatorioVisualDadosGrafico(t[1]);
    assert.equal(g.rotuloChave, "RESPONSAVEL"); assert.equal(g.metrica, "RECEITA");
    assert.deepEqual(g.linhas.map((x) => x.ROTULO), ["Ana", "Bruno", "Carla"]);
    assert.equal(g.pctChave, "WIN_RATE_PCT");
  });
});

describe("cockpit — funil e série derivados das tabelas", () => {
  test("funil acha a tabela de etapas e aponta o gargalo com volume relevante", () => {
    const f = mod.relatorioVisualDadosFunil(fixture().tabelas);
    assert.equal(f.indice, 0);
    assert.equal(f.gargalo.nome, "Proposta Enviada", "menor avanço entre etapas não terminais com ≥20 registros");
  });
  test("série acha a tabela mensal, ordena cronologicamente e traz o volume", () => {
    const s = mod.relatorioVisualDadosSerie(fixture().tabelas);
    assert.equal(s.indice, 3); assert.equal(s.pontos.length, 12); assert.equal(s.pontos[0].m, "2026-01"); assert.equal(s.pontos[0].n, 10); assert.equal(s.ehPct, true);
  });
  test("sem tabelas compatíveis devolve null", () => {
    assert.equal(mod.relatorioVisualDadosFunil([fixture().tabelas[1]]), null);
    assert.equal(mod.relatorioVisualDadosSerie([fixture().tabelas[1]]), null);
  });
});

describe("helpers de texto", () => {
  test("nota vira itens por frase; nota vazia vira lista vazia", () => {
    assert.equal(mod.relatorioVisualNotaEmItens(fixture().nota).length, 3);
    assert.equal(mod.relatorioVisualNotaEmItens("").length, 0);
  });
  test("rótulo curto corta no separador e limita o tamanho", () => {
    assert.equal(mod.relatorioVisualRotuloCurto("Funil de conversão — avanço por etapa"), "Funil de conversão");
    assert.equal(mod.relatorioVisualRotuloCurto("Ciclo de vendas — distribuição (decididos)"), "Ciclo de vendas");
    assert.ok(mod.relatorioVisualRotuloCurto("Um título realmente muito longo sem separador").endsWith("…"));
  });
  test("título editorial quebra no separador e destaca a segunda parte", () => {
    assert.equal(mod.relatorioVisualTituloEditorial("Conversão Comercial • funil e Win Rate"), "Conversão Comercial.<br><em>Funil e Win Rate.</em>");
    assert.equal(mod.relatorioVisualTituloEditorial("Diário SDR"), "Diário SDR");
  });
  test("alertas automáticos pelos KPIs", () => {
    assert.match(mod.pontosDeAtencaoGenerico([kpi("Fora SLA", 3)]), /Pontos de atenção/);
    assert.equal(mod.pontosDeAtencaoGenerico([kpi("Fora SLA", 0)]), "");
  });
});

describe("gerarHTMLRelatorioVisualGenerico — estrutura do HTML exportado", () => {
  test("sem título não gera nada", () => {
    assert.equal(mod.gerarHTMLRelatorioVisualGenerico(null), "");
    assert.equal(mod.gerarHTMLRelatorioVisualGenerico({ kpis: [] }), "");
  });

  const html = mod.gerarHTMLRelatorioVisualGenerico(fixture());

  test("documento autocontido (CSS/JS inline; só as fontes vêm de fora) e sem script injetado", () => {
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<style>[\s\S]+<\/style>/);
    assert.match(html, /<script>[\s\S]+<\/script><\/body>/);
    assert.equal((html.match(/src="http/g) || []).length, 0);
    assert.doesNotMatch(html, /<script>alert\(1\)/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  test("hero editorial com placar do indicador principal e sumário com rótulos curtos", () => {
    assert.match(html, /<h1>Conversão Comercial\.<br><em>/);
    assert.match(html, /class="placar-principal"><div><strong[^>]*data-numero="50.93"/);
    assert.match(html, /<nav class="sumario"/);
    assert.match(html, /href="#secao-1"><span class="n">1<\/span>Funil de conversão<\/a>/);
    assert.match(html, /href="#cockpit"/);
    assert.match(html, /href="#como-ler"/);
  });

  test("bento executivo: receita no tile escuro, indicador principal no laranja e Data Trust reconciliado", () => {
    assert.match(html, /tile tile-escuro"><span class="tile-rotulo">Receita ganha</);
    assert.match(html, /tile tile-laranja"><span class="tile-rotulo">Indicador principal<\/span><div class="tile-valor"[^>]*>50.93%/);
    assert.match(html, /Coorte reconciliada/);
    assert.match(html, /298 oportunidades = 110 ganhos \+ 106 perdas \+ 70 em aberto \+ 12 piloto \(em teste\)/);
  });

  test("cockpit: orbe do percentual, composição, tendência, funil e foco conectado", () => {
    assert.match(html, /class="arco" [^>]*data-pct="50.93"/);
    assert.equal((html.match(/class="mix-seg"/g) || []).length, 4);
    assert.match(html, /class="ck-card ck-trend"/);
    assert.match(html, /class="ck-card ck-funil"/);
    assert.match(html, /Maior gargalo com volume relevante: <b>Proposta Enviada<\/b>/);
    assert.match(html, /id="focoCorpo"/);
  });

  test("uma seção por tabela, visual conforme o tipo, tabela fechada quando há visual", () => {
    assert.equal((html.match(/<section class="secao anima[^"]*" id="secao-/g) || []).length, 6);
    assert.match(html, /id="secao-1"[\s\S]*?<span class="k">Ranking<\/span>/);
    assert.match(html, /id="secao-3"[\s\S]*?<span class="k">Comparativo<\/span>/);
    assert.match(html, /id="secao-4"[\s\S]*?class="v-tendencia"/);
    assert.match(html, /id="secao-5"[\s\S]*?class="v-colunas"/);
    assert.match(html, /<section class="secao anima dados-abertos" id="secao-6"/, "sem visual, a tabela já vem aberta");
    assert.equal((html.match(/class="btn-mini btn-dados"/g) || []).length, 5);
  });

  test("linhas e barras carregam data-rotulo (filtro/foco) e amostra baixa é sinalizada", () => {
    assert.match(html, /class="v-linha" data-rotulo="Ana"/);
    assert.match(html, /<tr data-rotulo="Ana">/);
    assert.match(html, /Carla<span class="amostra">amostra baixa · 2<\/span>/);
  });

  test("capítulos: autoral onde indicado, genérico antes da primeira seção", () => {
    assert.match(html, /<h2>Quem vende\.<\/h2><\/div><p>Leitura por vendedor\.<\/p><\/div><section class="secao anima[^"]*" id="secao-2"/);
    assert.match(html, /Análises detalhadas — gráfico primeiro, dados sob demanda\.[\s\S]*?id="secao-1"/);
  });

  test("como ler: texto autoral da tabela ou fallback com colunas; metodologia com glossário e notas", () => {
    assert.match(html, /<span class="i">i<\/span><span>Compare Win Rate com volume decidido\.<\/span>/);
    assert.match(html, /Cada linha é um registro com as colunas Nome, Total\./);
    assert.match(html, /id="como-ler"/);
    assert.equal((html.match(/class="glossario-item"/g) || []).length, 4);
    assert.equal((html.match(/<ul class="notas">[\s\S]*?<\/ul>/)[0].match(/<li>/g) || []).length, 3);
  });

  test("indicadores complementares ficam na gaveta com os 4 primeiros em destaque", () => {
    assert.match(html, /class="btn-gaveta"[^>]*>Ver todos os 8 indicadores \+/);
    assert.equal((html.match(/kpi kpi-destaque/g) || []).length, 4);
    assert.match(html, /data-numero="166526"[^>]*data-prefixo="R\$ "/);
  });

  test("marca no timbre e no rodapé; tema e voltar ao topo presentes", () => {
    assert.equal((html.match(/<svg data-logo><\/svg>/g) || []).length, 2);
    assert.match(html, /class="theme-toggle"/);
    assert.match(html, /class="voltar-topo"/);
  });

  test("relatório mínimo (sem tabelas, sem nota, sem KPI numérico) continua válido", () => {
    const h = mod.gerarHTMLRelatorioVisualGenerico({ titulo: "Vazio", kpis: [kpi("Status", "OK")] });
    assert.match(h, /Sem tabelas neste relatório/);
    assert.doesNotMatch(h, /id="como-ler"/);
    assert.doesNotMatch(h, /id="cockpit"/);
    assert.match(h, /Extração direta do CRM/);
  });
});
