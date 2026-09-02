import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { carregarScriptClassico } from "./helpers/carregar-script-classico.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "js", "config.js");

describe("js/config.js — Catálogo RELATORIOS", () => {
  test("não contém chaves duplicadas no código-fonte de RELATORIOS", () => {
    const content = readFileSync(CONFIG_PATH, "utf8");
    const relatoriosBlockMatch = content.match(/const RELATORIOS = \{([\s\S]*?)\};/);
    assert.ok(relatoriosBlockMatch, "Bloco RELATORIOS não encontrado em js/config.js");

    const block = relatoriosBlockMatch[1];
    const keyMatches = [...block.matchAll(/^\s*([a_z0-9_]+)\s*:/gmi)];
    const keys = keyMatches.map((m) => m[1]);

    const seen = new Set();
    const duplicates = [];
    for (const key of keys) {
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }

    assert.deepEqual(duplicates, [], `Chaves duplicadas encontradas no código-fonte de RELATORIOS: ${duplicates.join(", ")}`);
  });

  test("todas as chaves de RELATORIOS possuem grupo, label, descricao, handler e periodo válidos", () => {
    const ctx = carregarScriptClassico(CONFIG_PATH);
    const relatorios = vm.runInContext("RELATORIOS", ctx);
    assert.ok(relatorios && typeof relatorios === "object", "Objeto RELATORIOS é inválido");

    const requiredProperties = ["grupo", "label", "descricao", "handler", "periodo"];

    for (const [key, config] of Object.entries(relatorios)) {
      for (const prop of requiredProperties) {
        assert.ok(
          config[prop] && typeof config[prop] === "string" && config[prop].trim() !== "",
          `RELATORIOS['${key}'] está sem a propriedade '${prop}' ou possui valor vazio`
        );
      }
    }
  });

  test("contém as 8 chaves dos novos cards oficiais ausentes", () => {
    const ctx = carregarScriptClassico(CONFIG_PATH);
    const relatorios = vm.runInContext("RELATORIOS", ctx);

    const novaschaves = [
      "tempo_por_etapa",
      "gargalos",
      "mapa_transicoes",
      "clientes_parados",
      "clientes_recuperados",
      "crm_health_score",
      "negocios_sem_proxima_atividade",
      "auditoria_pipeline",
    ];

    for (const key of novaschaves) {
      assert.ok(relatorios[key], `Chave obrigatória '${key}' não foi cadastrada em RELATORIOS`);
    }
  });
});
