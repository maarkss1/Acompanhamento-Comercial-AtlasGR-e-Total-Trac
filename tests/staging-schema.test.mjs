// Testes unitários das funções PURAS de js/staging-schema.js (script clássico
// de navegador, carregado via node:vm — ver tests/helpers/carregar-script-classico.mjs).
//
// staging-schema.js espera, no navegador, que js/jornada.js já tenha sido
// carregado antes dele (mesmo padrão de dependência que já vale para
// js/cockpit.js e js/data-trust-score.js) — reproduzimos isso passando o
// contexto de jornada.js já carregado como `contextoExtra`.
//
// Todos os negócios/leads usados aqui são FICTÍCIOS, criados só para este
// teste — não são dados reais de cliente extraídos do Bitrix. Nenhum nome,
// telefone ou e-mail real aparece neste arquivo.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_JORNADA = path.join(__dirname, "..", "js", "jornada.js");
const CAMINHO_STAGING = path.join(__dirname, "..", "js", "staging-schema.js");

const jornada = carregarScriptClassico(CAMINHO_JORNADA);
const staging = carregarScriptClassico(CAMINHO_STAGING, { contextoExtra: jornada });

const AGORA_FIXO = new Date("2026-08-27T15:00:00.000Z");

describe("staging-schema.js — stagingConstruirId", () => {
  test("prefixa o ID do Bitrix com o portal (evita colisão entre AtlasGR e Total Trac)", () => {
    assert.equal(staging.stagingConstruirId("atlasgr", 500), "atlasgr:500");
    assert.equal(staging.stagingConstruirId("totaltrac", 500), "totaltrac:500");
    assert.notEqual(staging.stagingConstruirId("atlasgr", 500), staging.stagingConstruirId("totaltrac", 500));
  });

  test("portal desconhecido ou ID Bitrix inválido (0/vazio) devolve string vazia", () => {
    assert.equal(staging.stagingConstruirId("portal-inexistente", 500), "");
    assert.equal(staging.stagingConstruirId("atlasgr", 0), "");
    assert.equal(staging.stagingConstruirId("atlasgr", ""), "");
  });
});

describe("staging-schema.js — stagingValidarContraSchema", () => {
  test("acusa como ausente todo campo obrigatório vazio/null/undefined/array vazio", () => {
    const schema = {
      campos: [
        { campo: "a", obrigatorio: true },
        { campo: "b", obrigatorio: true },
        { campo: "c", obrigatorio: false }
      ]
    };
    const r = staging.stagingValidarContraSchema({ a: "", b: undefined, c: "" }, schema);
    assert.equal(r.valido, false);
    assert.deepEqual(Array.from(r.camposAusentes).sort(), ["a", "b"]);
  });

  test("registro completo é válido", () => {
    const schema = { campos: [{ campo: "a", obrigatorio: true }] };
    const r = staging.stagingValidarContraSchema({ a: "x" }, schema);
    assert.equal(r.valido, true);
    assert.deepEqual(Array.from(r.camposAusentes), []);
  });
});

describe("staging-schema.js — transformarNegocioParaStaging", () => {
  test("negócio fictício completo transforma para o contrato de staging e é válido", () => {
    const dealFicticio = {
      ID: "501",
      TITLE: "Negócio Fictício de Teste — Empresa Exemplo",
      STAGE_ID: "WON",
      CATEGORY_ID: "0",
      OPPORTUNITY: "15000.50",
      CURRENCY_ID: "BRL",
      DATE_CREATE: "2026-08-01T10:00:00-03:00",
      DATE_MODIFY: "2026-08-20T10:00:00-03:00",
      MOVED_TIME: "2026-08-20T10:00:00-03:00",
      CLOSEDATE: "2026-08-25",
      BEGINDATE: "2026-08-01",
      UF_CRM_1770928318695: "2026-08-25",
      ASSIGNED_BY_ID: "10",
      CREATED_BY_ID: "10",
      MODIFY_BY_ID: "11",
      MOVED_BY_ID: "11",
      COMPANY_ID: "900",
      CONTACT_ID: "0",
      LEAD_ID: "0",
      SOURCE_ID: "CALL",
      CLOSED: "Y"
    };

    const { registro, valido, camposAusentes, avisos } = staging.transformarNegocioParaStaging(dealFicticio, {
      portal: "atlasgr",
      extraidoEm: AGORA_FIXO,
      extraidoVia: "webhook:atlasgr"
    });

    assert.equal(valido, true);
    assert.deepEqual(Array.from(camposAusentes), []);
    assert.equal(registro.staging_id, "atlasgr:501");
    assert.equal(registro.bitrix_id, "501");
    assert.equal(registro.portal, "atlasgr");
    assert.equal(registro.valor, 15000.5);
    assert.equal(registro.empresa_id, "900");
    // CONTACT_ID/LEAD_ID = "0" no Bitrix = sem vínculo (idBitrixValido trata 0 como ausente).
    assert.equal(registro.contato_id, "");
    assert.equal(registro.lead_id, "");
    assert.equal(registro.fechado, true);
    assert.equal(registro.data_fechamento, "2026-08-25");
    assert.equal(registro.extraido_em, AGORA_FIXO.toISOString());
    assert.equal(registro.extraido_via, "webhook:atlasgr");
    assert.equal(registro.schema_version, staging.STAGING_SCHEMA_VERSION);
    // Tinha empresa (COMPANY_ID=900) e OPPORTUNITY>0, então nenhum desses dois avisos deve aparecer.
    assert.equal(avisos.includes("sem_vinculo_cliente"), false);
    assert.equal(avisos.includes("sem_valor"), false);
  });

  test("negócio fictício sem ID Bitrix válido é inválido e sinaliza bitrix_id_invalido", () => {
    const { registro, valido, camposAusentes, avisos } = staging.transformarNegocioParaStaging(
      { ID: "0", TITLE: "Negócio fictício sem ID" },
      { portal: "atlasgr", extraidoEm: AGORA_FIXO, extraidoVia: "webhook:atlasgr" }
    );
    assert.equal(valido, false);
    assert.ok(camposAusentes.includes("staging_id"));
    assert.ok(camposAusentes.includes("bitrix_id"));
    assert.ok(avisos.includes("bitrix_id_invalido"));
  });

  test("negócio fictício sem COMPANY_ID/CONTACT_ID/LEAD_ID sinaliza sem_vinculo_cliente", () => {
    const { avisos } = staging.transformarNegocioParaStaging(
      { ID: "777", TITLE: "Negócio fictício isolado", STAGE_ID: "NEW" },
      { portal: "totaltrac", extraidoEm: AGORA_FIXO, extraidoVia: "webhook:totaltrac" }
    );
    assert.ok(avisos.includes("sem_vinculo_cliente"));
  });

  test("negócio fictício sem OPPORTUNITY (ou igual a 0) sinaliza sem_valor", () => {
    const { avisos, registro } = staging.transformarNegocioParaStaging(
      { ID: "778", COMPANY_ID: "900", STAGE_ID: "NEW", OPPORTUNITY: "0" },
      { portal: "atlasgr", extraidoEm: AGORA_FIXO, extraidoVia: "webhook:atlasgr" }
    );
    assert.equal(registro.valor, 0);
    assert.ok(avisos.includes("sem_valor"));
  });

  test("data de modificação anterior à data de criação (dado inconsistente) é sinalizada, não descartada", () => {
    const { registro, avisos } = staging.transformarNegocioParaStaging(
      { ID: "779", COMPANY_ID: "900", STAGE_ID: "NEW", DATE_CREATE: "2026-08-20", DATE_MODIFY: "2026-08-10" },
      { portal: "atlasgr", extraidoEm: AGORA_FIXO, extraidoVia: "webhook:atlasgr" }
    );
    // O valor bruto/inconsistente é preservado no registro (não é "corrigido" silenciosamente)...
    assert.equal(registro.data_criacao, "2026-08-20");
    assert.equal(registro.data_modificacao, "2026-08-10");
    // ...mas a inconsistência é sinalizada em `avisos`.
    assert.ok(avisos.includes("data_modificacao_anterior_a_criacao"));
  });

  test("staging_id usa o portal como prefixo — dois portais com o mesmo ID Bitrix não colidem", () => {
    const a = staging.transformarNegocioParaStaging({ ID: "42", COMPANY_ID: "1" }, { portal: "atlasgr", extraidoEm: AGORA_FIXO, extraidoVia: "webhook:atlasgr" });
    const b = staging.transformarNegocioParaStaging({ ID: "42", COMPANY_ID: "1" }, { portal: "totaltrac", extraidoEm: AGORA_FIXO, extraidoVia: "webhook:totaltrac" });
    assert.notEqual(a.registro.staging_id, b.registro.staging_id);
  });
});

describe("staging-schema.js — transformarLeadParaStaging", () => {
  test("lead fictício completo (com telefone/e-mail fictícios) transforma corretamente", () => {
    const leadFicticio = {
      ID: "3001",
      TITLE: "Lead fictício de teste",
      STATUS_ID: "NEW",
      SOURCE_ID: "WEB",
      OPPORTUNITY: "5000",
      DATE_CREATE: "2026-08-10T09:00:00-03:00",
      DATE_MODIFY: "2026-08-15T09:00:00-03:00",
      ASSIGNED_BY_ID: "20",
      COMPANY_ID: "0",
      COMPANY_TITLE: "Empresa Fictícia Exemplo Ltda",
      CONTACT_ID: "0",
      NAME: "Fulano",
      LAST_NAME: "de Tal (fictício)",
      PHONE: [{ VALUE: "11999990000", VALUE_TYPE: "WORK" }],
      EMAIL: [{ VALUE: "fulano.ficticio@exemplo-teste.invalid", VALUE_TYPE: "WORK" }]
    };

    const { registro, valido, camposAusentes, avisos } = staging.transformarLeadParaStaging(leadFicticio, {
      portal: "atlasgr",
      extraidoEm: AGORA_FIXO,
      extraidoVia: "webhook:atlasgr"
    });

    assert.equal(valido, true);
    assert.deepEqual(Array.from(camposAusentes), []);
    assert.equal(registro.staging_id, "atlasgr:3001");
    assert.deepEqual(Array.from(registro.telefones), ["11999990000"]);
    assert.deepEqual(Array.from(registro.emails), ["fulano.ficticio@exemplo-teste.invalid"]);
    assert.equal(registro.empresa_titulo, "Empresa Fictícia Exemplo Ltda");
    assert.equal(avisos.includes("sem_contato"), false);
    assert.equal(avisos.includes("sem_nome_identificavel"), false);
  });

  test("lead fictício sem telefone nem e-mail sinaliza sem_contato", () => {
    const { avisos } = staging.transformarLeadParaStaging(
      { ID: "3002", TITLE: "Lead sem contato", STATUS_ID: "NEW" },
      { portal: "totaltrac", extraidoEm: AGORA_FIXO, extraidoVia: "webhook:totaltrac" }
    );
    assert.ok(avisos.includes("sem_contato"));
  });

  test("lead fictício sem nenhum nome identificável (empresa/nome/título) sinaliza sem_nome_identificavel", () => {
    const { avisos } = staging.transformarLeadParaStaging(
      { ID: "3003", STATUS_ID: "NEW", PHONE: [{ VALUE: "11988887777" }] },
      { portal: "atlasgr", extraidoEm: AGORA_FIXO, extraidoVia: "webhook:atlasgr" }
    );
    assert.ok(avisos.includes("sem_nome_identificavel"));
  });

  test("lead fictício sem ID Bitrix válido é inválido", () => {
    const { valido, camposAusentes } = staging.transformarLeadParaStaging(
      { ID: "", TITLE: "Lead sem ID" },
      { portal: "atlasgr", extraidoEm: AGORA_FIXO, extraidoVia: "webhook:atlasgr" }
    );
    assert.equal(valido, false);
    assert.ok(camposAusentes.includes("bitrix_id"));
  });
});

describe("staging-schema.js — contrato declarado (STAGING_SCHEMA_NEGOCIO / STAGING_SCHEMA_LEAD)", () => {
  test("todo campo PII do contrato de Leads está marcado pii:true (documentação do bloqueio de privacidade)", () => {
    const camposPiiEsperados = ["titulo", "empresa_titulo", "nome", "sobrenome", "telefones", "emails"];
    camposPiiEsperados.forEach((nomeCampo) => {
      const def = staging.STAGING_SCHEMA_LEAD.campos.find((c) => c.campo === nomeCampo);
      assert.ok(def, `campo ${nomeCampo} deveria existir no contrato de Leads`);
      assert.equal(def.pii, true, `campo ${nomeCampo} deveria estar marcado pii:true`);
    });
  });

  test("staging_id é a chave de negócio declarada nos dois contratos", () => {
    assert.equal(staging.STAGING_SCHEMA_NEGOCIO.chaveNegocio, "staging_id");
    assert.equal(staging.STAGING_SCHEMA_LEAD.chaveNegocio, "staging_id");
  });
});
