// Testa as funções puras de data/comparativo adicionadas na Fase 3 do
// redesign do Win Rate (periodoAnteriorEquivalente, periodoMesmaFaixaAnoAnterior,
// deltaFormatado) — a parte de maior risco de bug sutil (off-by-one, virada de
// mês/ano) da tarefa, e a mais barata de testar isoladamente (funções puras,
// sem Bitrix). classificarCoortePeriodo (que usa essas funções pra montar o
// comparativo/tendência) reaproveita a MESMA lógica de classificação
// Ganho/Perda/Aberto/Piloto já coberta manualmente pelo usuário (conferência
// de reconciliação 298 = 110+105+71+12 feita em dados reais) — não duplicada
// aqui.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_BITRIX = path.join(__dirname, "..", "js", "bitrix-api.js");
const CAMINHO_CATALOGO = path.join(__dirname, "..", "js", "catalogo-relatorios.js");

const bitrix = carregarScriptClassico(CAMINHO_BITRIX);
// classificarCoortePeriodo/periodoAnteriorEquivalente/etc. vivem em
// catalogo-relatorios.js mas só as 3 funções puras de data usadas aqui
// dependem de formatarDataISO (bitrix-api.js) — sem precisar carregar
// jornada/sdr/forecast pra este teste específico.
const catalogo = carregarScriptClassico(CAMINHO_CATALOGO, { contextoExtra: { ...bitrix } });

describe("Win Rate (conversao_comercial) — Fase 3: comparativo de período", () => {
  test("periodoAnteriorEquivalente: fim é o dia anterior ao início original, com a mesma duração", () => {
    const p = { inicio: "2026-01-01", fim: "2026-09-08" };
    const anterior = catalogo.periodoAnteriorEquivalente(p);

    assert.equal(anterior.fim, "2025-12-31", "fim do período anterior deve ser o dia imediatamente antes do início original");

    const duracao = (iso1, iso2) => Math.round((new Date(`${iso2}T12:00:00`) - new Date(`${iso1}T12:00:00`)) / 86400000) + 1;
    assert.equal(duracao(anterior.inicio, anterior.fim), duracao(p.inicio, p.fim), "período anterior deve ter a mesma duração em dias que o período atual");
  });

  test("periodoAnteriorEquivalente: período de 1 dia só (inicio===fim) fica com 1 dia de duração", () => {
    const anterior = catalogo.periodoAnteriorEquivalente({ inicio: "2026-05-10", fim: "2026-05-10" });
    assert.equal(anterior.fim, "2026-05-09");
    assert.equal(anterior.inicio, "2026-05-09");
  });

  test("periodoAnteriorEquivalente: sem inicio/fim (\"todas as datas\") retorna null", () => {
    assert.equal(catalogo.periodoAnteriorEquivalente({ inicio: "", fim: "" }), null);
    assert.equal(catalogo.periodoAnteriorEquivalente({}), null);
  });

  test("periodoMesmaFaixaAnoAnterior: desloca inicio e fim exatamente 1 ano", () => {
    // objeto retornado vem de um contexto vm separado (realm diferente) —
    // comparar campo a campo em vez de assert.deepEqual no objeto inteiro,
    // que falha por prototype/reference mismatch entre realms mesmo com
    // estrutura idêntica.
    const yoy = catalogo.periodoMesmaFaixaAnoAnterior({ inicio: "2026-03-15", fim: "2026-04-10" });
    assert.equal(yoy.inicio, "2025-03-15");
    assert.equal(yoy.fim, "2025-04-10");
    assert.equal(yoy.referencia, "2025-04-10");
  });

  test("periodoMesmaFaixaAnoAnterior: sem inicio/fim retorna null", () => {
    assert.equal(catalogo.periodoMesmaFaixaAnoAnterior({ inicio: "", fim: "" }), null);
  });

  test("periodoMesmaFaixaAnoAnterior: 29/fev (ano bissexto) cai em 1/mar no ano anterior não-bissexto — comportamento nativo do JS Date, documentado aqui pra não virar surpresa", () => {
    const yoy = catalogo.periodoMesmaFaixaAnoAnterior({ inicio: "2024-02-29", fim: "2024-02-29" });
    assert.equal(yoy.inicio, "2023-03-01");
  });

  test("deltaFormatado (pp): bate com o exemplo do usuário — 51.16 vs 47.8 = +3.4 p.p.", () => {
    assert.equal(catalogo.deltaFormatado(51.16, 47.8, "pp"), "+3.4 p.p.");
  });

  test("deltaFormatado (pct): bate com o exemplo do usuário — 110 vs 91 = +20.9%", () => {
    assert.equal(catalogo.deltaFormatado(110, 91, "pct"), "+20.9%");
  });

  test("deltaFormatado: negativo fica com sinal de menos, sem duplo sinal", () => {
    assert.equal(catalogo.deltaFormatado(40, 50, "pp"), "-10 p.p.");
    assert.equal(catalogo.deltaFormatado(80, 100, "pct"), "-20%");
  });

  test("deltaFormatado: sem base de comparação (anterior null/undefined) retorna travessão", () => {
    assert.equal(catalogo.deltaFormatado(50, null, "pp"), "—");
    assert.equal(catalogo.deltaFormatado(50, undefined, "pct"), "—");
  });

  test("deltaFormatado (pct): anterior zero não gera Infinity/NaN", () => {
    assert.equal(catalogo.deltaFormatado(0, 0, "pct"), "0%");
    assert.equal(catalogo.deltaFormatado(5, 0, "pct"), "—");
  });
});
