// Modelo visual genérico (js/relatorio-visual-generico.js): o HTML exportado
// é montado por string a partir de { titulo, kpis, tabelas, nota } — aqui
// garantimos a estrutura (uma seção por tabela, glossário, notas quebradas em
// itens, escape de HTML) e as funções puras de apoio (parse de número
// formatado, heurística do gráfico, animação de KPI), sem navegador.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_BITRIX = path.join(__dirname, "..", "js", "bitrix-api.js");
const CAMINHO_MODULO = path.join(__dirname, "..", "js", "relatorio-visual-generico.js");

const bitrix = carregarScriptClassico(CAMINHO_BITRIX);
const escapeHtmlRelatorio = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const marca = { nome: "AtlasGR", tagline: "Gerenciamento de Risco", corPrimaria: "#FF5618", corSecundaria1: "#FF8008", corSecundaria2: "#FF6B10", logoSvg: "<svg data-logo></svg>" };
const mod = carregarScriptClassico(CAMINHO_MODULO, {
  contextoExtra: {
    ...bitrix,
    escapeHtmlRelatorio,
    marcaAtiva: () => marca,
    moedaRelatorio: (n) => "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    formatarDataBR: (iso) => String(iso).split("-").reverse().join("/"),
  },
});

const kpi = (rotulo, valor, descricao) => (descricao ? { rotulo, valor, descricao } : { rotulo, valor });
function fixture() {
  return {
    chave: "conversao_comercial",
    titulo: "Conversão Comercial <script>alert(1)</script>",
    subtitulo: "Coorte criada entre <strong>2026-01-01</strong> e <strong>2026-09-08</strong>.",
    kpis: [
      kpi("Oportunidades", 298, "Todo negócio criado no período."),
      kpi("Ganhos", 110, "Contrato assinado no Financeiro."),
      kpi("Perdas", 106),
      kpi("Win Rate (fechados)", "50.93%", "Ganhos ÷ (Ganhos + Perdas)."),
      kpi("Receita ganha", "R$ 166.526,00", "Soma do valor dos Ganhos."),
      kpi("Ciclo médio", "30 dias"),
    ],
    tabelas: [
      { titulo: "Win Rate por vendedor", dados: [
        { RESPONSAVEL: "Ana", DECIDIDOS: 40, GANHOS: 30, RECEITA: 1000 },
        { RESPONSAVEL: "Bruno", DECIDIDOS: 25, GANHOS: 10, RECEITA: 500 },
        { RESPONSAVEL: "Carla", DECIDIDOS: 10, GANHOS: 2, RECEITA: 90 },
      ], colunas: [{ label: "Responsável", valor: "RESPONSAVEL" }, { label: "Decididos", valor: "DECIDIDOS" }, { label: "Win Rate", valor: (x) => `${((x.GANHOS / x.DECIDIDOS) * 100).toFixed(2)}%` }] },
      { titulo: "Sem gráfico (um rótulo só)", dados: [{ NOME: "X", TOTAL: 1 }, { NOME: "X", TOTAL: 2 }], colunas: [{ label: "Nome", valor: "NOME" }, { label: "Total", valor: "TOTAL" }] },
      { titulo: "Coorte mensal", dados: Array.from({ length: 15 }, (_, i) => ({ MES: `2026-${String(i + 1).padStart(2, "0")}`, OPORTUNIDADES: 15 - i })), colunas: [{ label: "Mês", valor: "MES" }, { label: "Oportunidades", valor: "OPORTUNIDADES" }] },
    ],
    nota: "Ganho = contrato assinado no Financeiro. Piloto fica fora de \"Em aberto\" de propósito (é etapa de teste). A Tendência é sempre fixa.",
  };
}

describe("relatorioVisualParseNumero — texto formatado → número", () => {
  test("moeda pt-BR, percentual, inteiro com milhar e 'N dias'", () => {
    assert.equal(mod.relatorioVisualParseNumero("R$ 1.513,87"), 1513.87);
    assert.equal(mod.relatorioVisualParseNumero("50.93%"), 50.93);
    assert.equal(mod.relatorioVisualParseNumero("1.234"), 1234);
    assert.equal(mod.relatorioVisualParseNumero("298"), 298);
    assert.equal(mod.relatorioVisualParseNumero("30 dias"), 30);
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
  test("moeda vira número com prefixo R$ e 2 decimais", () => {
    const a = mod.relatorioVisualKpiAnimacao("R$ 166.526,00");
    assert.equal(a.numero, 166526);
    assert.equal(a.prefixo, "R$ ");
    assert.equal(a.decimais, 2);
  });
  test("percentual preserva as casas decimais do texto original", () => {
    const a = mod.relatorioVisualKpiAnimacao("50.93%");
    assert.equal(a.numero, 50.93);
    assert.equal(a.sufixo, "%");
    assert.equal(a.decimais, 2);
  });
  test("valor não numérico não anima", () => {
    assert.equal(mod.relatorioVisualKpiAnimacao("—"), null);
    assert.equal(mod.relatorioVisualKpiAnimacao("Ana Silva"), null);
  });
});

describe("relatorioVisualDadosGrafico — heurística rótulo × métrica", () => {
  test("prioriza chaves conhecidas e ordena do maior pro menor", () => {
    const g = mod.relatorioVisualDadosGrafico(fixture().tabelas[0]);
    assert.equal(g.rotuloChave, "RESPONSAVEL");
    assert.equal(g.metrica, "RECEITA", "RECEITA vem antes de DECIDIDOS/GANHOS na lista de prioridade");
    assert.deepEqual(g.linhas.map((x) => x.ROTULO), ["Ana", "Bruno", "Carla"]);
    assert.equal(g.total, 1590);
  });
  test("sem 2 rótulos distintos ou com menos de 2 linhas não há gráfico", () => {
    assert.equal(mod.relatorioVisualDadosGrafico(fixture().tabelas[1]), null);
    assert.equal(mod.relatorioVisualDadosGrafico({ dados: [{ NOME: "A", TOTAL: 1 }] }), null);
    assert.equal(mod.relatorioVisualDadosGrafico({ dados: [] }), null);
  });
});

describe("relatorioVisualNotaEmItens — nota metodológica vira lista", () => {
  test("quebra por frase, sem quebrar dentro de parênteses/aspas no meio da frase", () => {
    const itens = mod.relatorioVisualNotaEmItens(fixture().nota);
    assert.equal(itens.length, 3);
    assert.match(itens[1], /^Piloto fica fora/);
  });
  test("nota vazia vira lista vazia", () => {
    // arrays vêm de outro realm (vm) — comparar por tamanho, não deepEqual.
    assert.equal(mod.relatorioVisualNotaEmItens("").length, 0);
    assert.equal(mod.relatorioVisualNotaEmItens(undefined).length, 0);
  });
});

describe("pontosDeAtencaoGenerico — alertas automáticos pelos KPIs", () => {
  test("rótulo com padrão de risco e valor > 0 gera alerta; zero não gera", () => {
    assert.match(mod.pontosDeAtencaoGenerico([kpi("Fora SLA", 3)]), /Pontos de atenção/);
    assert.equal(mod.pontosDeAtencaoGenerico([kpi("Fora SLA", 0)]), "");
    assert.equal(mod.pontosDeAtencaoGenerico([kpi("Ganhos", 10)]), "");
  });
});

describe("gerarHTMLRelatorioVisualGenerico — estrutura do HTML exportado", () => {
  test("sem título não gera nada", () => {
    assert.equal(mod.gerarHTMLRelatorioVisualGenerico(null), "");
    assert.equal(mod.gerarHTMLRelatorioVisualGenerico({ kpis: [] }), "");
  });

  const html = mod.gerarHTMLRelatorioVisualGenerico(fixture());

  test("documento autocontido: CSS e JS inline, sem dependência externa", () => {
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<style>[\s\S]+<\/style>/);
    assert.match(html, /<script>[\s\S]+<\/script><\/body>/);
    assert.doesNotMatch(html, /<link |src="http/);
  });

  test("título com HTML é escapado (nunca injeta script)", () => {
    assert.doesNotMatch(html, /<script>alert\(1\)/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  test("uma seção numerada por tabela, cada uma no sumário", () => {
    assert.equal((html.match(/class="secao anima"/g) || []).length, 3);
    for (const i of [1, 2, 3]) {
      assert.match(html, new RegExp(`id="secao-${i}"`));
      assert.match(html, new RegExp(`href="#secao-${i}"`));
    }
    assert.doesNotMatch(html, /top3grid/, "layout antigo em grid de 3 colunas não pode voltar");
  });

  test("gráfico só na tabela com par rótulo/métrica válido, com barras clicáveis", () => {
    assert.equal((html.match(/class="secao-body com-grafico"/g) || []).length, 2, "vendedor e coorte mensal têm gráfico; a tabela de rótulo único não");
    assert.equal((html.match(/class="secao-body"/g) || []).length, 1);
    assert.match(html, /class="barra-linha" data-rotulo="Ana"/);
    assert.match(html, /<tr data-rotulo="Ana">/);
  });

  test("KPIs: 4 primeiros em destaque, valores numéricos com data-* de animação, descrição visível", () => {
    assert.equal((html.match(/kpi kpi-destaque/g) || []).length, 4);
    assert.match(html, /data-numero="298"/);
    assert.match(html, /data-numero="50.93"[^>]*data-sufixo="%"/);
    assert.match(html, /data-numero="166526"[^>]*data-prefixo="R\$ "/);
    assert.match(html, /<div class="kpi-desc">Todo negócio criado no período\.<\/div>/);
  });

  test("'Como ler': glossário só dos KPIs com descrição e notas em itens", () => {
    assert.match(html, /id="como-ler"/);
    assert.equal((html.match(/class="glossario-item"/g) || []).length, 4);
    assert.equal((html.match(/<ul class="notas">[\s\S]*?<\/ul>/)[0].match(/<li>/g) || []).length, 3);
  });

  test("subtítulo perde as tags mas mantém o texto; marca aparece no letterhead e no rodapé", () => {
    assert.match(html, /Coorte criada entre 2026-01-01 e 2026-09-08\./);
    assert.equal((html.match(/<svg data-logo><\/svg>/g) || []).length, 2);
    assert.match(html, /Gerenciamento de Risco/);
  });

  test("sem tabelas e sem nota o documento continua válido", () => {
    const h = mod.gerarHTMLRelatorioVisualGenerico({ titulo: "Vazio", kpis: [] });
    assert.match(h, /Sem indicadores neste relatório/);
    assert.match(h, /Sem tabelas neste relatório/);
    assert.doesNotMatch(h, /id="como-ler"/);
  });
});
