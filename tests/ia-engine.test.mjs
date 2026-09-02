import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_CONFIG = path.join(__dirname, "..", "js", "config.js");
const CAMINHO_IA = path.join(__dirname, "..", "js", "ia-engine.js");

const config = carregarScriptClassico(CAMINHO_CONFIG);
const ia = carregarScriptClassico(CAMINHO_IA, {
  contextoExtra: {
    ...config,
    escapeHtmlRelatorio: (s) => String(s || ""),
    moedaRelatorio: (v) => `R$ ${Number(v).toLocaleString("pt-BR")}`,
  }
});

describe("Motor de IA Embarcada (js/ia-engine.js)", () => {
  test("iaDiagnosticarRelatorioCatalogo detecta Win Rate baixo e sugere ação", () => {
    const relatorioMock = {
      chave: "conversao_comercial",
      titulo: "Conversão Comercial",
      kpis: [
        { rotulo: "Win Rate Comercial", valor: "11%" },
        { rotulo: "Coverage", valor: "3.5x" }
      ],
      tabelas: []
    };

    const diag = ia.iaDiagnosticarRelatorioCatalogo(relatorioMock);
    assert.ok(diag, "Deve retornar diagnóstico");
    assert.ok(diag.pontosFortes.some(p => p.includes("Cobertura de pipeline robusta")), "Deve elogiar o coverage");
    assert.ok(diag.gargalos.some(g => g.includes("Taxa de conversão baixa")), "Deve apontar o Win Rate baixo");
    assert.ok(diag.acoes.length > 0, "Deve gerar ações");
  });

  test("iaDiagnosticarRelatorioCatalogo detecta No-Show elevado e aging crítico", () => {
    const relatorioMock = {
      chave: "no_show_sdr",
      titulo: "No-Show SDR",
      kpis: [
        { rotulo: "Taxa de No-Show", valor: "35%" },
        { rotulo: "Tempo Médio (Aging)", valor: "75d" }
      ],
      tabelas: []
    };

    const diag = ia.iaDiagnosticarRelatorioCatalogo(relatorioMock);
    assert.ok(diag, "Deve retornar diagnóstico");
    assert.ok(diag.gargalos.some(g => g.includes("No-show")), "Deve identificar no-show alto");
    assert.ok(diag.gargalos.some(g => g.includes("permanência alto")), "Deve identificar aging alto");
  });

  test("iaDiagnosticarCockpit gera narrativa executiva com base nos dados do Cockpit", () => {
    const cockpitMock = {
      resultadoMes: {
        metaMensal: 100000,
        fechadoMes: 85000,
        pctMeta: 85,
        gapMeta: 15000,
      },
      forecast: {
        forecastTotal: 120000,
        commit: 30000,
      },
      saude: {
        coverage: 3.2,
      },
      eficiencia: {
        winRateMensal: 28,
      }
    };

    const diag = ia.iaDiagnosticarCockpit(cockpitMock);
    assert.ok(diag, "Deve gerar diagnóstico do cockpit");
    assert.equal(diag.statusGeral, "bom");
    assert.ok(diag.tomAbertura.includes("85%"), "Deve citar a % da meta");
    assert.ok(diag.narrativa.includes("Forecast favorável"), "Deve avaliar o forecast favorável");
    assert.ok(diag.recomendacoes.length >= 2, "Deve conter recomendações práticas");
  });

  test("iaRenderizarCardInsightsHTML monta a estrutura visual correta", () => {
    const diag = {
      pontosFortes: ["Conversão positiva"],
      gargalos: ["Tempo de resposta"],
      acoes: ["Ligar mais rápido"],
      resumo: "Resumo teste"
    };

    const html = ia.iaRenderizarCardInsightsHTML(diag);
    assert.ok(html.includes("ia-insights-card"), "Deve conter a classe principal");
    assert.ok(html.includes("Conversão positiva"), "Deve conter o ponto forte");
    assert.ok(html.includes("Tempo de resposta"), "Deve conter o gargalo");
    assert.ok(html.includes("Ligar mais rápido"), "Deve conter a ação");
  });
});
