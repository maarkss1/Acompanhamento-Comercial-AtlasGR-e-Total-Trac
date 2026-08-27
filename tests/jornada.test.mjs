// Testes unitários das funções PURAS de js/jornada.js (script clássico de
// navegador, carregado via node:vm — ver tests/helpers/carregar-script-classico.mjs).
//
// Escopo: só funções sem I/O/DOM (recebem valores, devolvem valores). Nada
// aqui testa extração do Bitrix, renderização de tabela/HTML ou o DOM.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_JORNADA = path.join(__dirname, "..", "js", "jornada.js");

const jornada = carregarScriptClassico(CAMINHO_JORNADA);

describe("jornada.js — normalizarTextoChave", () => {
  test("remove acentos, baixa a caixa e colapsa espaços", () => {
    assert.equal(jornada.normalizarTextoChave("  Negociação  Comercial "), "negociacao comercial");
  });

  test("valor vazio/undefined vira string vazia", () => {
    assert.equal(jornada.normalizarTextoChave(undefined), "");
    assert.equal(jornada.normalizarTextoChave(null), "");
  });
});

describe("jornada.js — moedaRelatorio", () => {
  test("formata número como moeda pt-BR com 2 casas decimais", () => {
    assert.equal(jornada.moedaRelatorio(1234.5), "R$ 1.234,50");
    assert.equal(jornada.moedaRelatorio(0), "R$ 0,00");
  });

  test("valor não numérico é tratado como 0 (Number(valor) || 0)", () => {
    assert.equal(jornada.moedaRelatorio("abc"), "R$ 0,00");
    assert.equal(jornada.moedaRelatorio(undefined), "R$ 0,00");
  });
});

describe("jornada.js — formatarDataBR / chaveMesISO", () => {
  test("converte AAAA-MM-DD (ou prefixo ISO com hora) para DD/MM/AAAA", () => {
    assert.equal(jornada.formatarDataBR("2026-08-27"), "27/08/2026");
    assert.equal(jornada.formatarDataBR("2026-08-27T13:45:00-03:00"), "27/08/2026");
  });

  test("data vazia/ausente devolve string vazia", () => {
    assert.equal(jornada.formatarDataBR(""), "");
    assert.equal(jornada.formatarDataBR(undefined), "");
    assert.equal(jornada.formatarDataBR("valor-invalido"), "");
  });

  test("chaveMesISO extrai AAAA-MM; sem data usável devolve 'sem-data'", () => {
    assert.equal(jornada.chaveMesISO("2026-08-27"), "2026-08");
    assert.equal(jornada.chaveMesISO("2026-08-27T10:00:00"), "2026-08");
    assert.equal(jornada.chaveMesISO(""), "sem-data");
    assert.equal(jornada.chaveMesISO(undefined), "sem-data");
  });
});

describe("jornada.js — diferencaDiasAteReferencia (clampada) vs diferencaDiasBrutaAteReferencia (crua)", () => {
  test("data no passado: as duas funções concordam", () => {
    assert.equal(jornada.diferencaDiasAteReferencia("2026-08-20", "2026-08-27"), 7);
    assert.equal(jornada.diferencaDiasBrutaAteReferencia("2026-08-20", "2026-08-27"), 7);
  });

  test("data no futuro em relação à referência: a versão clampada trava em 0, a crua expõe o número negativo", () => {
    // v29 (ver comentário em js/jornada.js): diferencaDiasAteReferencia() usa
    // Math.max(0, ...) e esconde o valor negativo; diferencaDiasBrutaAteReferencia()
    // não clampa — é a versão usada quando o valor bruto (negativo = data no
    // futuro / relógio do Bitrix errado) importa para a decisão.
    assert.equal(jornada.diferencaDiasAteReferencia("2026-08-30", "2026-08-27"), 0);
    assert.equal(jornada.diferencaDiasBrutaAteReferencia("2026-08-30", "2026-08-27"), -3);
  });

  test("data ou referência ausente/inválida devolve string vazia nas duas versões", () => {
    assert.equal(jornada.diferencaDiasAteReferencia("", "2026-08-27"), "");
    assert.equal(jornada.diferencaDiasAteReferencia("2026-08-27", ""), "");
    assert.equal(jornada.diferencaDiasBrutaAteReferencia("", "2026-08-27"), "");
  });
});

describe("jornada.js — dataDentroFaixa", () => {
  test("true quando a data cai dentro do intervalo [inicio, fim] inclusive", () => {
    assert.equal(jornada.dataDentroFaixa("2026-08-15", "2026-08-01", "2026-08-31"), true);
    assert.equal(jornada.dataDentroFaixa("2026-08-01", "2026-08-01", "2026-08-31"), true);
    assert.equal(jornada.dataDentroFaixa("2026-08-31", "2026-08-01", "2026-08-31"), true);
  });

  test("false quando a data cai fora do intervalo", () => {
    assert.equal(jornada.dataDentroFaixa("2026-07-31", "2026-08-01", "2026-08-31"), false);
    assert.equal(jornada.dataDentroFaixa("2026-09-01", "2026-08-01", "2026-08-31"), false);
  });

  test("sem 'inicio' e/ou sem 'fim' o limite correspondente não restringe", () => {
    assert.equal(jornada.dataDentroFaixa("2000-01-01", "", "2026-08-31"), true);
    assert.equal(jornada.dataDentroFaixa("2099-01-01", "2026-08-01", ""), true);
  });

  test("data vazia/ausente é sempre false", () => {
    assert.equal(jornada.dataDentroFaixa("", "2026-08-01", "2026-08-31"), false);
  });
});

describe("jornada.js — semanticaDeal", () => {
  test("usa STAGE_SEMANTIC_ID do negócio quando presente ('S'/'F'/outro)", () => {
    assert.equal(jornada.semanticaDeal({ STAGE_SEMANTIC_ID: "S" }, null), "success");
    assert.equal(jornada.semanticaDeal({ STAGE_SEMANTIC_ID: "F" }, null), "failure");
    assert.equal(jornada.semanticaDeal({ STAGE_SEMANTIC_ID: "apology" }, null), "failure");
    assert.equal(jornada.semanticaDeal({ STAGE_SEMANTIC_ID: "P" }, null), "process");
  });

  test("cai no fallback metaStage?.semantics quando STAGE_SEMANTIC_ID está vazio", () => {
    assert.equal(jornada.semanticaDeal({ STAGE_SEMANTIC_ID: "" }, { semantics: "S" }), "success");
    assert.equal(jornada.semanticaDeal({ STAGE_SEMANTIC_ID: "" }, { semantics: "F" }), "failure");
  });

  test("sem STAGE_SEMANTIC_ID nem metaStage.semantics, o default é 'process'", () => {
    assert.equal(jornada.semanticaDeal({}, null), "process");
    assert.equal(jornada.semanticaDeal({}, {}), "process");
  });
});

describe("jornada.js — probabilidadeFallbackForecast", () => {
  test("semântica success/failure manda e ignora o label", () => {
    assert.equal(jornada.probabilidadeFallbackForecast("qualquer coisa", "success"), 100);
    assert.equal(jornada.probabilidadeFallbackForecast("qualquer coisa", "failure"), 0);
  });

  test("classifica por palavra-chave do label do estágio quando semântica é 'process'", () => {
    assert.equal(jornada.probabilidadeFallbackForecast("Contrato Assinado", "process"), 80);
    assert.equal(jornada.probabilidadeFallbackForecast("Proposta enviada", "process"), 60);
    assert.equal(jornada.probabilidadeFallbackForecast("Negociação final", "process"), 60);
    assert.equal(jornada.probabilidadeFallbackForecast("Reunião de diagnóstico", "process"), 40);
    assert.equal(jornada.probabilidadeFallbackForecast("Nova oportunidade", "process"), 20);
  });

  test("label sem palavra-chave reconhecida cai no default de 30", () => {
    assert.equal(jornada.probabilidadeFallbackForecast("Estágio Customizado XYZ", "process"), 30);
    assert.equal(jornada.probabilidadeFallbackForecast("", "process"), 30);
  });
});

describe("jornada.js — classificarBucketForecast (thresholds 80/50 — fonte de verdade do Forecast Semanal)", () => {
  test("success/failure viram Fechado/Perdido independente da probabilidade", () => {
    assert.equal(jornada.classificarBucketForecast(10, "success"), "Fechado");
    assert.equal(jornada.classificarBucketForecast(90, "failure"), "Perdido");
  });

  test("em 'process', bucket depende só do threshold de probabilidade", () => {
    assert.equal(jornada.classificarBucketForecast(80, "process"), "Commit");
    assert.equal(jornada.classificarBucketForecast(50, "process"), "Best Case");
    assert.equal(jornada.classificarBucketForecast(49, "process"), "Pipeline");
    assert.equal(jornada.classificarBucketForecast(0, "process"), "Pipeline");
  });
});
