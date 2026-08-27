// ============================================================================
// Camada de Staging (Bronze) — Contrato de dados para Negócios e Leads
// Wave 2.2 (Agente 01 — Enterprise Data Architect, Sprint 02: Modelo
// Corporativo de Dados)
//
// ⚠️ BLOQUEIO DE PRIVACIDADE — LEIA ANTES DE USAR ESTE ARQUIVO PARA PERSISTIR
// QUALQUER COISA. Detalhe completo, com opções e prós/contras, em:
//   docs/intelligence-hub-cpi/execucao/wave-02/01_CAMADA_STAGING_FORMALIZADA.md
//
// Este arquivo define APENAS:
//   (a) o contrato de dados (schema) da Camada 1/Staging para Negócios e
//       Leads — campos, tipos, obrigatoriedade, chave de negócio, versão de
//       schema, proveniência;
//   (b) funções PURAS de transformação (bruto Bitrix → formato de staging) e
//       validação (obrigatoriedade + inconsistências), sem nenhum efeito
//       colateral.
//
// O que este arquivo NÃO faz e NÃO deve ser usado para fazer:
//   - Não persiste nada em disco, git, localStorage ou qualquer backend.
//   - Não faz nenhuma chamada de rede.
//   - Não é (e não deve ser tratado como) uma automação GitHub Actions —
//     nenhuma foi criada nesta tarefa, deliberadamente.
//   - NÃO deve ser interpretado como "a Camada 1 de staging já está pronta
//     para uso em produção": o repositório deste projeto é público no
//     GitHub, e os campos de Leads (nome, telefone, e-mail) e o TITLE de
//     Negócios frequentemente carregam nome de cliente/pessoa (PII). Gerar
//     um snapshot com estas funções e commitar o resultado em
//     `relatorios/` exporia PII de cliente real em histórico git público,
//     permanentemente. Ver o documento acima para as opções reais de
//     persistir isso sem esse risco.
//
// Reaproveita helpers já existentes em js/jornada.js (que precisa estar
// carregado ANTES deste arquivo — mesma ordem de <script> que já vale para
// js/cockpit.js, que também depende de jornada.js ter carregado primeiro):
// parteDataISO, idBitrixValido, idBitrixString, valoresMulticampo,
// normalizarTelefone. Nenhuma dessas é duplicada aqui.
//
// STATUS: não registrado em nenhum <script src> de página HTML ainda (mesmo
// status inicial de js/data-trust-score.js) — arquivo aditivo, não altera
// comportamento de nenhum relatório existente.
// ============================================================================

var STAGING_SCHEMA_VERSION = "1.0.0";

// Portais Bitrix independentes hoje suportados pelo projeto (js/config.js,
// objeto MARCAS). Um negócio/lead só existe dentro de UM desses portais —
// não há portal único filtrado.
var STAGING_PORTAIS_VALIDOS = ["atlasgr", "totaltrac"];

// Chave de negócio (business key) da Camada 1: `${portal}:${bitrix_id}`.
// IMPORTANTE — por que não usar só `Negocio.ID`/`Lead.ID` (como o relatório
// da Wave 1 sugeriu inicialmente): como AtlasGR e Total Trac são dois
// portais Bitrix INDEPENDENTES, cada um numera seus próprios IDs a partir de
// 1 — nada impede que exista um "Negócio ID 500" na AtlasGR e um "Negócio ID
// 500" completamente diferente na Total Trac. Sem o prefixo de portal, um
// snapshot que juntasse as duas empresas coliria as chaves silenciosamente.
function stagingConstruirId(portal, bitrixId) {
  const idNum = (typeof idBitrixString === "function") ? idBitrixString(bitrixId) : String(bitrixId || "");
  if (!STAGING_PORTAIS_VALIDOS.includes(portal) || !idNum) return "";
  return `${portal}:${idNum}`;
}

// ---------------------------------------------------------------------------
// Contrato de dados — Negócios (Deals)
// Campos e rótulos alinhados a `ENTIDADES.negocios` (js/config.js:50-125).
// `tipo` é descritivo (não há checagem de tipo em runtime além do que
// `stagingValidarContraSchema` faz para obrigatoriedade); `pii` sinaliza os
// campos que motivam o bloqueio de privacidade desta tarefa.
// ---------------------------------------------------------------------------
var STAGING_SCHEMA_NEGOCIO = {
  entidade: "negocios",
  schemaVersion: STAGING_SCHEMA_VERSION,
  chaveNegocio: "staging_id", // = stagingConstruirId(portal, bitrix_id)
  campos: [
    { campo: "staging_id", tipo: "string", obrigatorio: true, origem: "derivado", pii: false, descricao: "Chave de negócio da Camada 1: `${portal}:${bitrix_id}`." },
    { campo: "bitrix_id", tipo: "string_numerica", obrigatorio: true, origem: "nativo(ID)", pii: false, descricao: "ID nativo do negócio no portal Bitrix de origem. Único DENTRO do portal, não entre portais." },
    { campo: "portal", tipo: "enum:atlasgr|totaltrac", obrigatorio: true, origem: "proveniencia", pii: false, descricao: "Qual dos dois portais Bitrix (empresa) gerou o registro." },
    { campo: "titulo", tipo: "string", obrigatorio: false, origem: "nativo(TITLE)", pii: true, descricao: "Frequentemente contém nome de cliente/contato — tratar como PII." },
    { campo: "estagio_id", tipo: "string", obrigatorio: true, origem: "nativo(STAGE_ID)", pii: false },
    { campo: "categoria_id", tipo: "string", obrigatorio: false, origem: "nativo(CATEGORY_ID)", pii: false, descricao: "Funil (0=Comercial, 20=Financeiro, etc. — ver js/config.js)." },
    { campo: "valor", tipo: "number", obrigatorio: false, origem: "nativo(OPPORTUNITY)", pii: false },
    { campo: "moeda", tipo: "string", obrigatorio: false, origem: "nativo(CURRENCY_ID)", pii: false },
    { campo: "data_criacao", tipo: "data_iso", obrigatorio: false, origem: "nativo(DATE_CREATE)", pii: false },
    { campo: "data_modificacao", tipo: "data_iso", obrigatorio: false, origem: "nativo(DATE_MODIFY)", pii: false },
    { campo: "data_movido_estagio", tipo: "data_iso", obrigatorio: false, origem: "nativo(MOVED_TIME)", pii: false },
    { campo: "data_fechamento", tipo: "data_iso", obrigatorio: false, origem: "nativo(CLOSEDATE)", pii: false },
    { campo: "data_inicio", tipo: "data_iso", obrigatorio: false, origem: "nativo(BEGINDATE)", pii: false },
    { campo: "data_contrato_assinado", tipo: "data_iso", obrigatorio: false, origem: "customizado(UF_CRM_1770928318695)", pii: false, descricao: "Campo customizado oficial — ver js/jornada.js fecharDataDeal." },
    { campo: "responsavel_id", tipo: "string_numerica", obrigatorio: false, origem: "nativo(ASSIGNED_BY_ID)", pii: false },
    { campo: "criado_por_id", tipo: "string_numerica", obrigatorio: false, origem: "nativo(CREATED_BY_ID)", pii: false },
    { campo: "modificado_por_id", tipo: "string_numerica", obrigatorio: false, origem: "nativo(MODIFY_BY_ID)", pii: false },
    { campo: "movido_por_id", tipo: "string_numerica", obrigatorio: false, origem: "nativo(MOVED_BY_ID)", pii: false },
    { campo: "empresa_id", tipo: "string_numerica", obrigatorio: false, origem: "nativo(COMPANY_ID)", pii: false, descricao: "0 é tratado como AUSENTE (ver idBitrixValido), não como empresa real." },
    { campo: "contato_id", tipo: "string_numerica", obrigatorio: false, origem: "nativo(CONTACT_ID)", pii: false },
    { campo: "lead_id", tipo: "string_numerica", obrigatorio: false, origem: "nativo(LEAD_ID)", pii: false },
    { campo: "origem_id", tipo: "string", obrigatorio: false, origem: "nativo(SOURCE_ID)", pii: false },
    { campo: "fechado", tipo: "boolean|null", obrigatorio: false, origem: "nativo(CLOSED)", pii: false, descricao: "'Y'/'N' do Bitrix convertido para true/false; null se ausente." },
    { campo: "extraido_em", tipo: "data_iso_hora", obrigatorio: true, origem: "proveniencia", pii: false, descricao: "Timestamp (ISO 8601, UTC) do momento da extração/transformação — não a data do dado em si." },
    { campo: "extraido_via", tipo: "string", obrigatorio: true, origem: "proveniencia", pii: false, descricao: "Identificador da fonte, ex.: 'webhook:atlasgr'. NUNCA a URL/token do webhook em si — ver risco de credencial exposta já registrado na Wave 1." },
    { campo: "schema_version", tipo: "string", obrigatorio: true, origem: "proveniencia", pii: false, descricao: "Versão deste contrato no momento da transformação (STAGING_SCHEMA_VERSION)." }
  ]
};

// ---------------------------------------------------------------------------
// Contrato de dados — Leads
// Campos e rótulos alinhados a `ENTIDADES.leads` (js/config.js:126-162).
// Concentra a maior parte dos campos PII do projeto (NOME, TELEFONE, EMAIL)
// — é o principal motivo do bloqueio de privacidade desta tarefa.
// ---------------------------------------------------------------------------
var STAGING_SCHEMA_LEAD = {
  entidade: "leads",
  schemaVersion: STAGING_SCHEMA_VERSION,
  chaveNegocio: "staging_id", // = stagingConstruirId(portal, bitrix_id)
  campos: [
    { campo: "staging_id", tipo: "string", obrigatorio: true, origem: "derivado", pii: false, descricao: "Chave de negócio da Camada 1: `${portal}:${bitrix_id}`." },
    { campo: "bitrix_id", tipo: "string_numerica", obrigatorio: true, origem: "nativo(ID)", pii: false },
    { campo: "portal", tipo: "enum:atlasgr|totaltrac", obrigatorio: true, origem: "proveniencia", pii: false },
    { campo: "titulo", tipo: "string", obrigatorio: false, origem: "nativo(TITLE)", pii: true },
    { campo: "estagio_id", tipo: "string", obrigatorio: true, origem: "nativo(STATUS_ID)", pii: false },
    { campo: "origem_id", tipo: "string", obrigatorio: false, origem: "nativo(SOURCE_ID)", pii: false },
    { campo: "valor", tipo: "number", obrigatorio: false, origem: "nativo(OPPORTUNITY)", pii: false },
    { campo: "data_criacao", tipo: "data_iso", obrigatorio: false, origem: "nativo(DATE_CREATE)", pii: false },
    { campo: "data_modificacao", tipo: "data_iso", obrigatorio: false, origem: "nativo(DATE_MODIFY)", pii: false },
    { campo: "responsavel_id", tipo: "string_numerica", obrigatorio: false, origem: "nativo(ASSIGNED_BY_ID)", pii: false },
    { campo: "empresa_id", tipo: "string_numerica", obrigatorio: false, origem: "nativo(COMPANY_ID)", pii: false },
    { campo: "empresa_titulo", tipo: "string", obrigatorio: false, origem: "nativo(COMPANY_TITLE)", pii: true },
    { campo: "contato_id", tipo: "string_numerica", obrigatorio: false, origem: "nativo(CONTACT_ID)", pii: false },
    { campo: "nome", tipo: "string", obrigatorio: false, origem: "nativo(NAME)", pii: true },
    { campo: "sobrenome", tipo: "string", obrigatorio: false, origem: "nativo(LAST_NAME)", pii: true },
    { campo: "telefones", tipo: "string[]", obrigatorio: false, origem: "nativo(PHONE, multicampo)", pii: true, descricao: "Extraído via valoresMulticampo — Bitrix representa telefone como multicampo (lista de {VALUE,...})." },
    { campo: "emails", tipo: "string[]", obrigatorio: false, origem: "nativo(EMAIL, multicampo)", pii: true },
    { campo: "extraido_em", tipo: "data_iso_hora", obrigatorio: true, origem: "proveniencia", pii: false },
    { campo: "extraido_via", tipo: "string", obrigatorio: true, origem: "proveniencia", pii: false, descricao: "Ex.: 'webhook:totaltrac'. Nunca a URL/token do webhook." },
    { campo: "schema_version", tipo: "string", obrigatorio: true, origem: "proveniencia", pii: false }
  ]
};

// ---- validação genérica contra um schema declarado acima -------------------
// Só checa obrigatoriedade (campo ausente/null/""/[] vazio) — não faz
// checagem de tipo em runtime (o contrato acima é a documentação do tipo
// esperado; validação de tipo mais estrita fica para uma wave futura, se o
// projeto decidir que vale o custo de manutenção).
function stagingValidarContraSchema(registro, schema) {
  const camposAusentes = [];
  (schema?.campos || []).forEach((c) => {
    if (!c.obrigatorio) return;
    const v = registro ? registro[c.campo] : undefined;
    const vazio = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (vazio) camposAusentes.push(c.campo);
  });
  return { valido: camposAusentes.length === 0, camposAusentes };
}

// ---- pequenos utilitários locais (não duplicam nada de jornada.js) --------
function stagingBooleanBitrix(valor) {
  const s = String(valor ?? "").trim().toUpperCase();
  if (s === "Y") return true;
  if (s === "N") return false;
  return null;
}

// ---- transformação: negócio bruto do Bitrix → registro de staging ---------
// dealBruto: objeto no formato retornado por crm.deal.list (mesmo formato já
// consumido por js/jornada.js e js/catalogo-relatorios.js).
// opcoes.portal: "atlasgr" | "totaltrac" (obrigatório).
// opcoes.extraidoEm: Date ou string ISO (default: new Date() no momento da
//   chamada — para teste determinístico, sempre passe um valor fixo).
// opcoes.extraidoVia: string curta identificando a fonte (ex.: "webhook:atlasgr").
//   NUNCA passe a URL/token do webhook aqui.
function transformarNegocioParaStaging(dealBruto, opcoes = {}) {
  const portal = opcoes.portal;
  const extraidoEmDate = opcoes.extraidoEm instanceof Date ? opcoes.extraidoEm : (opcoes.extraidoEm ? new Date(opcoes.extraidoEm) : new Date());
  const extraidoEmISO = Number.isNaN(extraidoEmDate.getTime()) ? "" : extraidoEmDate.toISOString();
  const extraidoVia = opcoes.extraidoVia || "";

  const d = dealBruto || {};
  const idValido = (typeof idBitrixValido === "function") ? idBitrixValido : (v) => Boolean(v);
  const idString = (typeof idBitrixString === "function") ? idBitrixString : (v) => (idValido(v) ? String(v) : "");
  const parteData = (typeof parteDataISO === "function") ? parteDataISO : () => "";

  const bitrixIdOk = idValido(d.ID);
  const empresaOk = idValido(d.COMPANY_ID);
  const contatoOk = idValido(d.CONTACT_ID);
  const leadOk = idValido(d.LEAD_ID);

  const registro = {
    staging_id: bitrixIdOk ? stagingConstruirId(portal, d.ID) : "",
    bitrix_id: idString(d.ID),
    portal: portal || "",
    titulo: d.TITLE || "",
    estagio_id: d.STAGE_ID || "",
    categoria_id: d.CATEGORY_ID !== undefined && d.CATEGORY_ID !== null ? String(d.CATEGORY_ID) : "",
    valor: Number(d.OPPORTUNITY) || 0,
    moeda: d.CURRENCY_ID || "",
    data_criacao: parteData(d.DATE_CREATE),
    data_modificacao: parteData(d.DATE_MODIFY),
    data_movido_estagio: parteData(d.MOVED_TIME),
    data_fechamento: parteData(d.CLOSEDATE),
    data_inicio: parteData(d.BEGINDATE),
    data_contrato_assinado: parteData(d.UF_CRM_1770928318695),
    responsavel_id: idString(d.ASSIGNED_BY_ID),
    criado_por_id: idString(d.CREATED_BY_ID),
    modificado_por_id: idString(d.MODIFY_BY_ID),
    movido_por_id: idString(d.MOVED_BY_ID),
    empresa_id: idString(d.COMPANY_ID),
    contato_id: idString(d.CONTACT_ID),
    lead_id: idString(d.LEAD_ID),
    origem_id: d.SOURCE_ID || "",
    fechado: stagingBooleanBitrix(d.CLOSED),
    extraido_em: extraidoEmISO,
    extraido_via: extraidoVia,
    schema_version: STAGING_SCHEMA_VERSION
  };

  const { valido, camposAusentes } = stagingValidarContraSchema(registro, STAGING_SCHEMA_NEGOCIO);

  const avisos = [];
  if (!bitrixIdOk) avisos.push("bitrix_id_invalido");
  if (portal && !STAGING_PORTAIS_VALIDOS.includes(portal)) avisos.push("portal_desconhecido");
  if (!empresaOk && !contatoOk && !leadOk) avisos.push("sem_vinculo_cliente");
  if (registro.data_movido_estagio && extraidoEmISO && registro.data_movido_estagio > extraidoEmISO.slice(0, 10)) avisos.push("data_movido_estagio_no_futuro");
  if (registro.data_criacao && registro.data_modificacao && registro.data_modificacao < registro.data_criacao) avisos.push("data_modificacao_anterior_a_criacao");
  if (!(Number(d.OPPORTUNITY) > 0)) avisos.push("sem_valor");

  return { registro, valido, camposAusentes, avisos };
}

// ---- transformação: lead bruto do Bitrix → registro de staging ------------
// leadBruto: objeto no formato retornado por crm.lead.list.
// Mesmas opções que transformarNegocioParaStaging.
function transformarLeadParaStaging(leadBruto, opcoes = {}) {
  const portal = opcoes.portal;
  const extraidoEmDate = opcoes.extraidoEm instanceof Date ? opcoes.extraidoEm : (opcoes.extraidoEm ? new Date(opcoes.extraidoEm) : new Date());
  const extraidoEmISO = Number.isNaN(extraidoEmDate.getTime()) ? "" : extraidoEmDate.toISOString();
  const extraidoVia = opcoes.extraidoVia || "";

  const l = leadBruto || {};
  const idValido = (typeof idBitrixValido === "function") ? idBitrixValido : (v) => Boolean(v);
  const idString = (typeof idBitrixString === "function") ? idBitrixString : (v) => (idValido(v) ? String(v) : "");
  const parteData = (typeof parteDataISO === "function") ? parteDataISO : () => "";
  const multicampo = (typeof valoresMulticampo === "function") ? valoresMulticampo : () => [];

  const bitrixIdOk = idValido(l.ID);
  const telefones = multicampo(l, "PHONE").map((v) => String(v).trim()).filter(Boolean);
  const emails = multicampo(l, "EMAIL").map((v) => String(v).trim()).filter(Boolean);

  const registro = {
    staging_id: bitrixIdOk ? stagingConstruirId(portal, l.ID) : "",
    bitrix_id: idString(l.ID),
    portal: portal || "",
    titulo: l.TITLE || "",
    estagio_id: l.STATUS_ID || "",
    origem_id: l.SOURCE_ID || "",
    valor: Number(l.OPPORTUNITY) || 0,
    data_criacao: parteData(l.DATE_CREATE),
    data_modificacao: parteData(l.DATE_MODIFY),
    responsavel_id: idString(l.ASSIGNED_BY_ID),
    empresa_id: idString(l.COMPANY_ID),
    empresa_titulo: l.COMPANY_TITLE || "",
    contato_id: idString(l.CONTACT_ID),
    nome: l.NAME || "",
    sobrenome: l.LAST_NAME || "",
    telefones,
    emails,
    extraido_em: extraidoEmISO,
    extraido_via: extraidoVia,
    schema_version: STAGING_SCHEMA_VERSION
  };

  const { valido, camposAusentes } = stagingValidarContraSchema(registro, STAGING_SCHEMA_LEAD);

  const avisos = [];
  if (!bitrixIdOk) avisos.push("bitrix_id_invalido");
  if (portal && !STAGING_PORTAIS_VALIDOS.includes(portal)) avisos.push("portal_desconhecido");
  const semNome = !String(registro.empresa_titulo || registro.nome || registro.titulo || "").trim();
  if (semNome) avisos.push("sem_nome_identificavel");
  if (!telefones.length && !emails.length) avisos.push("sem_contato");
  if (registro.data_criacao && registro.data_modificacao && registro.data_modificacao < registro.data_criacao) avisos.push("data_modificacao_anterior_a_criacao");

  return { registro, valido, camposAusentes, avisos };
}
