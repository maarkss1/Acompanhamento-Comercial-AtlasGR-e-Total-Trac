// Testes unitários das funções PURAS de js/entity-resolution.js (script
// clássico de navegador, carregado via node:vm — ver
// tests/helpers/carregar-script-classico.mjs).
//
// Todos os dados usados aqui são FICTÍCIOS (nomes, IDs e empresas inventados
// só para o teste) — nenhum dado real de cliente da AtlasGR/Total Trac
// aparece neste arquivo.
//
// Escopo: calcularChaveIdentidade() e resolverMasterEntity(), cobrindo os 3
// níveis de confiança (ALTA/MEDIA/BAIXA) definidos em
// js/entity-resolution.js (ER_CONFIANCA_POR_TIPO) e pelo menos um caso de
// match ambíguo (manual_review_required=true sem a chave ser BAIXA).
//
// Nota técnica: objetos/arrays devolvidos pelas funções carregadas via
// node:vm pertencem ao "realm" do sandbox (Object.prototype/Array.prototype
// próprios) — assert.deepEqual (deepStrictEqual) falha ao comparar contra um
// literal criado neste arquivo mesmo quando o conteúdo é idêntico ("same
// structure but not reference-equal"). plano() faz um round-trip JSON para
// devolver dados simples no realm deste arquivo antes de comparar.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_ENTITY_RESOLUTION = path.join(__dirname, "..", "js", "entity-resolution.js");

const er = carregarScriptClassico(CAMINHO_ENTITY_RESOLUTION);

function plano(valor) {
  return JSON.parse(JSON.stringify(valor));
}

// contexto.agora aceita qualquer objeto com toISOString() (duck-typing em
// js/entity-resolution.js) — evita o problema clássico de `instanceof Date`
// falhar entre o realm deste arquivo e o realm do vm sandbox.
function dataFixa(iso) {
  return new Date(iso);
}

describe("entity-resolution.js — calcularChaveIdentidade (hierarquia de jornada.js:875-913)", () => {
  test("COMPANY_ID válido vence qualquer outro vínculo (confiança ALTA)", () => {
    const negocio = { ID: "1", TITLE: "Negócio fictício", COMPANY_ID: "500", CONTACT_ID: "60", LEAD_ID: "70" };
    const r = er.calcularChaveIdentidade(negocio);
    assert.deepEqual(plano(r), { chave: "COMPANY:500", tipo: "COMPANY_ID", confianca: "ALTA" });
  });

  test("sem COMPANY_ID, CONTACT_ID válido vence LEAD_ID (confiança ALTA)", () => {
    const negocio = { ID: "2", TITLE: "Negócio fictício", COMPANY_ID: "0", CONTACT_ID: "61", LEAD_ID: "71" };
    const r = er.calcularChaveIdentidade(negocio);
    assert.deepEqual(plano(r), { chave: "CONTACT:61", tipo: "CONTACT_ID", confianca: "ALTA" });
  });

  test("sem COMPANY_ID/CONTACT_ID, LEAD_ID válido vence nome (confiança MEDIA)", () => {
    const negocio = { ID: "3", TITLE: "Cliente Fictício Alfa", COMPANY_ID: "0", CONTACT_ID: "0", LEAD_ID: "72" };
    const r = er.calcularChaveIdentidade(negocio);
    assert.deepEqual(plano(r), { chave: "LEAD:72", tipo: "LEAD_ID", confianca: "MEDIA" });
  });

  test("sem nenhum ID válido, nome confiável (não operacional) vira chave por nome (confiança MEDIA)", () => {
    const negocio = { ID: "4", TITLE: "Cliente Fictício Comércio de Testes Ltda - (Financeiro)", COMPANY_ID: "0", CONTACT_ID: "0", LEAD_ID: "0" };
    const r = er.calcularChaveIdentidade(negocio);
    assert.equal(r.tipo, "NOME_NORMALIZADO");
    assert.equal(r.confianca, "MEDIA");
    // limparNomeClienteParaChave remove o sufixo de departamento antes de normalizar.
    assert.equal(r.chave, "NOME:cliente ficticio comercio de testes ltda");
  });

  test("nome que parece registro operacional/interno NÃO vira chave por nome — cai isolado (confiança BAIXA)", () => {
    const negocio = { ID: "5", TITLE: "Testando", COMPANY_ID: "0", CONTACT_ID: "0", LEAD_ID: "0" };
    const r = er.calcularChaveIdentidade(negocio);
    assert.deepEqual(plano(r), { chave: "DEAL:5", tipo: "DEAL_ID_ISOLADO", confianca: "BAIXA" });
  });

  test("ID=0 (Bitrix) nunca vira 'COMPANY:0'/'CONTACT:0'/'LEAD:0' — tratado como sem vínculo", () => {
    const negocio = { ID: "6", TITLE: "", COMPANY_ID: "0", CONTACT_ID: "0.0", LEAD_ID: "null" };
    const r = er.calcularChaveIdentidade(negocio);
    assert.equal(r.tipo, "DEAL_ID_ISOLADO");
    assert.equal(r.chave, "DEAL:6");
  });

  test("tipoRegistro='LEAD': hierarquia COMPANY_ID > CONTACT_ID > NOME > LEAD_ID_ISOLADO (sem tier LEAD_ID, seria circular)", () => {
    const leadComEmpresa = { ID: "900", TITLE: "Lead fictício", COMPANY_ID: "700", CONTACT_ID: "0" };
    assert.deepEqual(
      plano(er.calcularChaveIdentidade(leadComEmpresa, { tipoRegistro: "LEAD" })),
      { chave: "COMPANY:700", tipo: "COMPANY_ID", confianca: "ALTA" }
    );

    const leadIsolado = { ID: "901", TITLE: "Teste", COMPANY_ID: "0", CONTACT_ID: "0" };
    assert.deepEqual(
      plano(er.calcularChaveIdentidade(leadIsolado, { tipoRegistro: "LEAD" })),
      { chave: "LEAD:901", tipo: "LEAD_ID_ISOLADO", confianca: "BAIXA" }
    );
  });
});

describe("entity-resolution.js — resolverMasterEntity: 3 níveis de confiança", () => {
  test("confiança ALTA via COMPANY_ID exato: manual_review_required=false quando não há sinal de duplicidade", () => {
    const negocio = { ID: "1001", TITLE: "Negócio Empresa Fictícia Um", COMPANY_ID: "500", CONTACT_ID: "0", LEAD_ID: "0" };
    const empresasPorId = {
      "500": { ID: "500", TITLE: "Empresa Fictícia Um Ltda", PHONE: "11999990000", EMAIL: "contato@fake-um.example" }
    };
    const agora = dataFixa("2026-08-27T12:00:00Z");
    const r = er.resolverMasterEntity(negocio, { empresasPorId, empresa: "atlasgr", agora });

    assert.equal(r.master_entity_id, "COMPANY:500");
    assert.equal(r.confidence, "ALTA");
    assert.deepEqual(plano(r.match_rules), ["company_id_exato"]);
    assert.equal(r.manual_review_required, false);
    assert.equal(r.criado_em, agora.toISOString());
    assert.equal(r.atualizado_em, agora.toISOString());
    assert.deepEqual(
      plano(r.source_record_ids).sort((a, b) => a.entidade.localeCompare(b.entidade)),
      [
        { entidade: "EMPRESA", id: "500", empresa: "atlasgr" },
        { entidade: "NEGOCIO", id: "1001", empresa: "atlasgr" }
      ]
    );
  });

  test("confiança MEDIA via LEAD_ID exato (sem COMPANY_ID/CONTACT_ID)", () => {
    const negocio = { ID: "1002", TITLE: "Negócio via lead fictício", COMPANY_ID: "0", CONTACT_ID: "0", LEAD_ID: "777" };
    const r = er.resolverMasterEntity(negocio, { empresa: "totaltrac" });

    assert.equal(r.master_entity_id, "LEAD:777");
    assert.equal(r.confidence, "MEDIA");
    assert.deepEqual(plano(r.match_rules), ["lead_id_exato"]);
    assert.equal(r.manual_review_required, false);
    assert.deepEqual(
      plano(r.source_record_ids).sort((a, b) => a.entidade.localeCompare(b.entidade)),
      [
        { entidade: "LEAD", id: "777", empresa: "totaltrac" },
        { entidade: "NEGOCIO", id: "1002", empresa: "totaltrac" }
      ]
    );
  });

  test("confiança BAIXA via DEAL_ID_ISOLADO: manual_review_required=true (nome operacional/interno)", () => {
    const negocio = { ID: "1004", TITLE: "Testando", COMPANY_ID: "0", CONTACT_ID: "0", LEAD_ID: "0" };
    const r = er.resolverMasterEntity(negocio, { empresa: "atlasgr" });

    assert.equal(r.master_entity_id, "DEAL:1004");
    assert.equal(r.confidence, "BAIXA");
    assert.deepEqual(plano(r.match_rules), ["deal_id_isolado"]);
    assert.equal(r.manual_review_required, true);
    assert.deepEqual(plano(r.source_record_ids), [{ entidade: "NEGOCIO", id: "1004", empresa: "atlasgr" }]);
  });
});

describe("entity-resolution.js — resolverMasterEntity: match ambíguo (manual_review_required=true sem confiança BAIXA)", () => {
  test("COMPANY_ID exato (confiança ALTA) mas empresa tem sinal de possível cadastro duplicado (mesmo nome normalizado em outro COMPANY_ID)", () => {
    // Duas empresas FICTÍCIAS diferentes (COMPANY_ID 600 e 601) com exatamente
    // o mesmo nome normalizado — sinal já existente em jornada.js
    // (construirSinaisDuplicidadeEmpresas), reaproveitado aqui, nunca fundido.
    const empresasPorId = {
      "600": { ID: "600", TITLE: "Distribuidora Fictícia Beta" },
      "601": { ID: "601", TITLE: "Distribuidora Fictícia Beta" }
    };
    const negocio = { ID: "1005", TITLE: "Negócio da Distribuidora Beta", COMPANY_ID: "600", CONTACT_ID: "0", LEAD_ID: "0" };
    const r = er.resolverMasterEntity(negocio, { empresasPorId, empresa: "atlasgr" });

    assert.equal(r.master_entity_id, "COMPANY:600");
    assert.equal(r.confidence, "ALTA"); // COMPANY_ID continua sendo um match exato
    assert.deepEqual(plano(r.match_rules), ["company_id_exato"]); // sinal de duplicidade não é uma regra de match
    assert.equal(r.manual_review_required, true); // mas exige revisão humana mesmo assim
  });

  test("empresa SEM sinal de duplicidade (nomes diferentes) não força revisão", () => {
    const empresasPorId = {
      "610": { ID: "610", TITLE: "Distribuidora Fictícia Gama" },
      "611": { ID: "611", TITLE: "Comércio Fictício Delta" }
    };
    const negocio = { ID: "1006", TITLE: "Negócio da Gama", COMPANY_ID: "610", CONTACT_ID: "0", LEAD_ID: "0" };
    const r = er.resolverMasterEntity(negocio, { empresasPorId, empresa: "atlasgr" });

    assert.equal(r.confidence, "ALTA");
    assert.equal(r.manual_review_required, false);
  });
});

describe("entity-resolution.js — resolverMasterEntity: source_record_ids[] agregado da extração", () => {
  test("dois negócios diferentes que caem na MESMA chave por nome normalizado aparecem juntos em source_record_ids", () => {
    const negociosDaExtracao = [
      { ID: "2001", TITLE: "Cliente Fictício Recorrente", COMPANY_ID: "0", CONTACT_ID: "0", LEAD_ID: "0" },
      { ID: "2002", TITLE: "Cliente Fictício Recorrente", COMPANY_ID: "0", CONTACT_ID: "0", LEAD_ID: "0" },
      { ID: "2003", TITLE: "Outro Cliente Fictício Sem Relação", COMPANY_ID: "0", CONTACT_ID: "0", LEAD_ID: "0" }
    ];

    const r1 = er.resolverMasterEntity(negociosDaExtracao[0], { negociosDaExtracao, empresa: "totaltrac" });
    const r2 = er.resolverMasterEntity(negociosDaExtracao[1], { negociosDaExtracao, empresa: "totaltrac" });

    assert.equal(r1.master_entity_id, r2.master_entity_id);
    assert.equal(r1.source_record_ids.length, 2);
    assert.deepEqual(
      plano(r1.source_record_ids.map((x) => x.id)).sort(),
      ["2001", "2002"]
    );
    // O terceiro negócio (nome diferente) não deve aparecer.
    assert.ok(!r1.source_record_ids.some((x) => x.id === "2003"));
  });

  test("sem negociosDaExtracao informado, source_record_ids contém só o próprio negócio", () => {
    const negocio = { ID: "3001", TITLE: "Cliente Fictício Solo", COMPANY_ID: "0", CONTACT_ID: "0", LEAD_ID: "0" };
    const r = er.resolverMasterEntity(negocio, {});
    assert.deepEqual(plano(r.source_record_ids), [{ entidade: "NEGOCIO", id: "3001", empresa: null }]);
  });
});

describe("entity-resolution.js — resolverMasterEntity: registro tipo LEAD", () => {
  test("lead com COMPANY_ID válido resolve com entidade 'LEAD' em source_record_ids + âncora 'EMPRESA'", () => {
    const lead = { ID: "9001", TITLE: "Lead fictício", COMPANY_ID: "700", CONTACT_ID: "0" };
    const empresasPorId = { "700": { ID: "700", TITLE: "Empresa Fictícia Sete" } };
    const r = er.resolverMasterEntity(lead, { tipoRegistro: "LEAD", empresasPorId, empresa: "atlasgr" });

    assert.equal(r.master_entity_id, "COMPANY:700");
    assert.equal(r.confidence, "ALTA");
    assert.deepEqual(
      plano(r.source_record_ids).sort((a, b) => a.entidade.localeCompare(b.entidade)),
      [
        { entidade: "EMPRESA", id: "700", empresa: "atlasgr" },
        { entidade: "LEAD", id: "9001", empresa: "atlasgr" }
      ]
    );
  });

  test("lead isolado (sem empresa/contato/nome confiável) vira LEAD_ID_ISOLADO, confiança BAIXA, revisão obrigatória", () => {
    const lead = { ID: "9002", TITLE: "Teste", COMPANY_ID: "0", CONTACT_ID: "0" };
    const r = er.resolverMasterEntity(lead, { tipoRegistro: "LEAD" });

    assert.equal(r.master_entity_id, "LEAD:9002");
    assert.equal(r.confidence, "BAIXA");
    assert.equal(r.manual_review_required, true);
    assert.deepEqual(plano(r.match_rules), ["lead_id_isolado"]);
  });
});

describe("entity-resolution.js — resolverMasterEntity: criado_em preservado quando informado", () => {
  test("contexto.criadoEmAnterior é preservado em criado_em; atualizado_em usa 'agora'", () => {
    const negocio = { ID: "4001", TITLE: "Cliente Fictício Y", COMPANY_ID: "800", CONTACT_ID: "0", LEAD_ID: "0" };
    const criadoEmAnterior = "2026-01-10T09:00:00.000Z";
    const agora = dataFixa("2026-08-27T12:00:00Z");
    const r = er.resolverMasterEntity(negocio, { empresa: "atlasgr", agora, criadoEmAnterior });

    assert.equal(r.criado_em, criadoEmAnterior);
    assert.equal(r.atualizado_em, agora.toISOString());
  });

  test("erro claro quando 'negocio' não é um objeto", () => {
    assert.throws(() => er.resolverMasterEntity(null), /precisa ser um objeto/);
    assert.throws(() => er.resolverMasterEntity(undefined), /precisa ser um objeto/);
  });
});
