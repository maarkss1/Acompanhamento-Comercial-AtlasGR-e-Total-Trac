// ============================================================================
// Entity Resolution — Wave 2.2 (Agente 04, Sprint 02 — Modelo Corporativo
// de Dados)
//
// Especificação completa, evidência das 4 implementações divergentes hoje
// existentes e justificativa de cada decisão desta formalização:
// docs/intelligence-hub-cpi/execucao/wave-02/04_ENTITY_RESOLUTION_MODULO_FORMALIZADO.md
//
// Origem: docs/intelligence-hub-cpi/execucao/wave-01-fundacao/
//   04_ENTITY_RESOLUTION_SPECIALIST_RESOLUCAO_DE_ENTIDADES.md — este arquivo
// EXTRAI para um módulo compartilhado a hierarquia de resolução de identidade
// de cliente já implementada em js/jornada.js (extrairJornada(), linhas
// 875-913), que é a versão mais completa/canônica das 4 variações hoje
// espalhadas pelo código (ver documento acima para file:linha de cada uma).
//
// STATUS — leia antes de usar em qualquer lugar novo:
//   - Este arquivo NÃO é carregado por nenhum <script src> de página HTML
//     ainda (mesmo status inicial de js/data-trust-score.js na Wave 2.1).
//   - js/jornada.js, js/cockpit.js, js/sdr.js e js/catalogo-relatorios.js
//     CONTINUAM com suas 4 implementações divergentes originais — nenhuma
//     delas foi alterada ou migrada para chamar este módulo. Migrá-las é
//     trabalho futuro explicitamente fora do escopo desta tarefa (arriscado
//     sem suíte de regressão visual dos 4 relatórios afetados) — ver seção
//     "Migração futura" no documento acima para o file:linha exato de cada
//     duplicação.
//   - NÃO existe, nesta tarefa, nenhuma persistência do resultado desta
//     resolução (nem em relatorios/, nem em GitHub Actions). Isso é uma
//     decisão explícita de produto — ver "BLOQUEIO DE PRIVACIDADE" no
//     documento formalizado: este repositório é público, e
//     source_record_ids[]/nomes normalizados são identificadores de clientes
//     reais. Este arquivo só expõe funções PURAS de cálculo em memória.
//
// Por que este arquivo duplica pequenas funções utilitárias já existentes em
// js/jornada.js (normalizarTextoChave, idBitrixValido, etc.) em vez de
// chamá-las diretamente: este projeto não tem bundler nem import/export
// (scripts clássicos carregados via <script src>, ver comentário em
// js/jornada.js linha ~453) e este módulo precisa poder ser carregado e
// testado de forma isolada (tests/entity-resolution.test.mjs usa
// tests/helpers/carregar-script-classico.mjs, que roda SÓ este arquivo em um
// contexto vm isolado — sem js/jornada.js carregado junto). As funções abaixo
// são PORTS LITERAIS (mesma regex, mesma lista de prefixos, mesmo
// comportamento) das equivalentes em js/jornada.js, prefixadas com "er" para
// nunca colidir com o global de mesmo nome caso este arquivo um dia seja
// carregado na mesma página que js/jornada.js. Nenhuma regra de match nova
// foi inventada — ver requisito 3 da missão desta tarefa.
// ============================================================================

// ---- utilitários portados de js/jornada.js (mesma lógica, prefixo "er") ---

// Port literal de idBitrixValido (js/jornada.js:11-17). ID=0/"0"/null/vazio
// nunca é um vínculo válido — nunca vira "COMPANY:0" etc.
function erIdBitrixValido(valor) {
  if (valor === null || valor === undefined) return false;
  const s = String(valor).trim();
  if (!s || s === "0" || s === "0.0" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

// Port literal de idBitrixString (js/jornada.js:19-22).
function erIdBitrixString(valor) {
  if (!erIdBitrixValido(valor)) return "";
  return String(Math.trunc(Number(valor)));
}

// Port literal de normalizarTextoChave (js/jornada.js:1-9): remove acentos,
// baixa para minúsculas, colapsa não-alfanumérico em espaço único, trim.
function erNormalizarTextoChave(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Port literal de normalizarTelefone (js/jornada.js:54-57).
function erNormalizarTelefone(valor) {
  const digitos = String(valor || "").replace(/\D/g, "");
  return digitos.length >= 8 ? digitos.slice(-11) : "";
}

// Port literal de limparNomeClienteParaChave (js/jornada.js:24-29): remove
// sufixos de departamento interno colados no título do negócio/lead antes de
// normalizar para chave (ex.: "Cliente X - (Financeiro)" -> "Cliente X").
function erLimparNomeClienteParaChave(valor) {
  let s = String(valor || "").trim();
  s = s.replace(/\s*[-–—]\s*\((comercial|financeiro|p[oó]s[\s-]*vendas?|implant[aã]ç[aã]o|sucesso do cliente|perfil securit[aá]rio|reembolso|rh|t\.?i\.?)\)\s*[-–—]?\s*$/i, "");
  s = s.replace(/\s*\((comercial|financeiro|p[oó]s[\s-]*vendas?|implant[aã]ç[aã]o|sucesso do cliente|perfil securit[aá]rio|reembolso|rh|t\.?i\.?)\)\s*$/i, "");
  return s.trim();
}

// Port literal de nomePareceOperacionalJornada (js/jornada.js:31-43): nomes
// de registros operacionais/internos nunca viram chave de cliente por nome —
// caem no tier isolado (DEAL_ID_ISOLADO / LEAD_ID_ISOLADO), confiança BAIXA.
function erNomeAparentaOperacional(valor) {
  const n = erNormalizarTextoChave(valor);
  if (!n || n.length < 3) return true;
  const prefixos = [
    "preencher formulario de crm",
    "abertura chamado sc",
    "formulario reembolso",
    "sucesso do cliente",
    "testando",
    "teste"
  ];
  return prefixos.some((p) => n.startsWith(p));
}

// Port literal de valoresMulticampo (js/jornada.js:59-64): normaliza campos
// multivalor do Bitrix (PHONE/EMAIL vêm como array de {VALUE,...}).
function erValoresMulticampo(registro, campo) {
  const v = registro?.[campo];
  if (!v) return [];
  const lista = Array.isArray(v) ? v : [v];
  return lista.map((x) => (typeof x === "object" ? (x.VALUE || x.value || "") : x)).filter(Boolean);
}

// Port literal de construirSinaisDuplicidadeEmpresas (js/jornada.js:183-230):
// agrupa empresas por nome/e-mail/telefone normalizados e sinaliza, para cada
// COMPANY_ID, se há OUTRO COMPANY_ID com o mesmo sinal — nunca funde IDs,
// só sinaliza para revisão humana. Reaproveitado aqui (não reinventado) para
// alimentar manual_review_required quando a chave de identidade é COMPANY_ID
// mas a própria empresa pode ser um cadastro duplicado de outra.
function erConstruirSinaisDuplicidadeEmpresas(empresasPorId) {
  const porNome = {};
  const porEmail = {};
  const porTelefone = {};

  Object.values(empresasPorId).forEach((e) => {
    const id = String(e.ID || "");
    const nome = erNormalizarTextoChave(e.TITLE);
    if (nome) (porNome[nome] ||= new Set()).add(id);
    erValoresMulticampo(e, "EMAIL").map((x) => String(x).trim().toLowerCase()).filter(Boolean)
      .forEach((x) => (porEmail[x] ||= new Set()).add(id));
    erValoresMulticampo(e, "PHONE").map(erNormalizarTelefone).filter(Boolean)
      .forEach((x) => (porTelefone[x] ||= new Set()).add(id));
  });

  const sinais = {};
  Object.values(empresasPorId).forEach((e) => {
    const id = String(e.ID || "");
    const motivos = [];
    const idsRelacionados = new Set();

    const nome = erNormalizarTextoChave(e.TITLE);
    if (nome && (porNome[nome]?.size || 0) > 1) {
      motivos.push("nome");
      porNome[nome].forEach((x) => idsRelacionados.add(x));
    }
    erValoresMulticampo(e, "EMAIL").map((x) => String(x).trim().toLowerCase()).filter(Boolean).forEach((x) => {
      if ((porEmail[x]?.size || 0) > 1) {
        motivos.push("email");
        porEmail[x].forEach((y) => idsRelacionados.add(y));
      }
    });
    erValoresMulticampo(e, "PHONE").map(erNormalizarTelefone).filter(Boolean).forEach((x) => {
      if ((porTelefone[x]?.size || 0) > 1) {
        motivos.push("telefone");
        porTelefone[x].forEach((y) => idsRelacionados.add(y));
      }
    });

    idsRelacionados.delete(id);
    sinais[id] = {
      duplicado: idsRelacionados.size > 0,
      motivos: [...new Set(motivos)],
      ids: [...idsRelacionados].sort((a, b) => Number(a) - Number(b))
    };
  });
  return sinais;
}

// ---- schema MASTER_ENTITY_ID (vocabulário do CPI) --------------------------
//
// Saída de resolverMasterEntity(), formato do CPI (02_DADOS_E_BITRIX/
// 03_ENTITY_RESOLUTION.txt):
//
//   master_entity_id        string  — mesma chave já usada por jornada.js
//                                      (CLIENTE_KEY): "COMPANY:123" |
//                                      "CONTACT:456" | "LEAD:789" |
//                                      "NOME:<texto normalizado>" |
//                                      "DEAL:<id>" | "LEAD:<id>" (isolado)
//   source_record_ids[]     array   — [{ entidade, id, empresa }], onde
//                                      entidade ∈ {"NEGOCIO","LEAD","CONTATO",
//                                      "EMPRESA"}; id = ID Bitrix bruto (string);
//                                      empresa = "atlasgr"|"totaltrac"|outro
//                                      identificador de portal, ou null quando
//                                      não informado pelo chamador (ver
//                                      contexto.empresa)
//   match_rules[]            array  — lista de slugs da(s) regra(s) que
//                                      contribuíram pro match; hoje SEMPRE
//                                      length 1, porque a hierarquia de
//                                      jornada.js é "primeira regra que bate
//                                      vence" — o campo já é lista para
//                                      suportar, no futuro, um matcher
//                                      multi-sinal (ex. "nome_normalizado" +
//                                      "telefone") sem quebrar o schema.
//                                      Valores possíveis hoje:
//                                      "company_id_exato" | "contact_id_exato"
//                                      | "lead_id_exato" | "nome_normalizado"
//                                      | "deal_id_isolado" | "lead_id_isolado"
//   confidence                string — "ALTA" | "MEDIA" | "BAIXA" (mesmos 3
//                                      níveis de CLIENTE_KEY_CONFIANCA em
//                                      jornada.js). ALTA = COMPANY_ID ou
//                                      CONTACT_ID exato. MEDIA = LEAD_ID exato
//                                      OU nome normalizado confiável (não
//                                      operacional). BAIXA = negócio/lead
//                                      isolado, sem nenhum vínculo nem nome
//                                      confiável (DEAL_ID_ISOLADO/LEAD_ID_ISOLADO).
//   manual_review_required   boolean — true quando confidence === "BAIXA", OU
//                                      quando a chave é COMPANY_ID mas a
//                                      própria empresa tem sinal de possível
//                                      cadastro duplicado (mesmo nome/e-mail/
//                                      telefone que outro COMPANY_ID — sinal
//                                      já existente em jornada.js, reaproveitado
//                                      aqui, nunca fundido automaticamente).
//   criado_em / atualizado_em string — ISO 8601. Como esta função é PURA e sem
//                                      persistência (ver bloqueio de
//                                      privacidade no documento formalizado),
//                                      as duas datas são iguais por padrão
//                                      (calculadas no momento da chamada).
//                                      Um chamador com estado anterior (uma
//                                      futura camada de persistência) pode
//                                      passar contexto.criadoEmAnterior para
//                                      preservar o criado_em original entre
//                                      chamadas — nada neste repositório usa
//                                      esse parâmetro hoje.

const ER_MATCH_RULE_POR_TIPO = {
  COMPANY_ID: "company_id_exato",
  CONTACT_ID: "contact_id_exato",
  LEAD_ID: "lead_id_exato",
  NOME_NORMALIZADO: "nome_normalizado",
  DEAL_ID_ISOLADO: "deal_id_isolado",
  LEAD_ID_ISOLADO: "lead_id_isolado"
};

const ER_CONFIANCA_POR_TIPO = {
  COMPANY_ID: "ALTA",
  CONTACT_ID: "ALTA",
  LEAD_ID: "MEDIA",
  NOME_NORMALIZADO: "MEDIA",
  DEAL_ID_ISOLADO: "BAIXA",
  LEAD_ID_ISOLADO: "BAIXA"
};

// ---- hierarquia de identidade (mesma regra de jornada.js:875-913) ---------
//
// calcularChaveIdentidade(registro, opcoes) isola só o cálculo da chave/tipo/
// confiança, sem I/O e sem depender do restante da extração — é o núcleo que
// js/jornada.js:881-913 já implementa para negócios (COMPANY_ID > CONTACT_ID
// > LEAD_ID > NOME_NORMALIZADO > DEAL_ID_ISOLADO).
//
// opcoes.tipoRegistro: "NEGOCIO" (padrão, registro = crm.deal) ou "LEAD"
// (registro = crm.lead). Um lead não tem um "LEAD_ID" apontando para si mesmo
// (seria circular), então para tipoRegistro="LEAD" o tier LEAD_ID é omitido e
// o fallback isolado usa o próprio ID do lead ("LEAD_ID_ISOLADO" em vez de
// "DEAL_ID_ISOLADO") — mesma hierarquia de sinais (COMPANY_ID > CONTACT_ID >
// NOME), nenhuma regra nova.
function calcularChaveIdentidade(registro, opcoes = {}) {
  const tipoRegistro = opcoes.tipoRegistro === "LEAD" ? "LEAD" : "NEGOCIO";
  const r = registro || {};

  const companyOk = erIdBitrixValido(r.COMPANY_ID);
  const contactOk = erIdBitrixValido(r.CONTACT_ID);
  const leadOk = tipoRegistro === "NEGOCIO" && erIdBitrixValido(r.LEAD_ID);

  if (companyOk) {
    return { chave: `COMPANY:${erIdBitrixString(r.COMPANY_ID)}`, tipo: "COMPANY_ID", confianca: ER_CONFIANCA_POR_TIPO.COMPANY_ID };
  }
  if (contactOk) {
    return { chave: `CONTACT:${erIdBitrixString(r.CONTACT_ID)}`, tipo: "CONTACT_ID", confianca: ER_CONFIANCA_POR_TIPO.CONTACT_ID };
  }
  if (leadOk) {
    return { chave: `LEAD:${erIdBitrixString(r.LEAD_ID)}`, tipo: "LEAD_ID", confianca: ER_CONFIANCA_POR_TIPO.LEAD_ID };
  }

  const tituloBruto = r.TITLE || (tipoRegistro === "LEAD" ? `${r.NAME || ""} ${r.LAST_NAME || ""}`.trim() : "");
  const nomeLimpo = erLimparNomeClienteParaChave(tituloBruto);
  const nomeNorm = erNormalizarTextoChave(nomeLimpo);
  if (nomeNorm && !erNomeAparentaOperacional(nomeLimpo)) {
    return { chave: `NOME:${nomeNorm}`, tipo: "NOME_NORMALIZADO", confianca: ER_CONFIANCA_POR_TIPO.NOME_NORMALIZADO };
  }

  if (tipoRegistro === "LEAD") {
    return { chave: `LEAD:${r.ID}`, tipo: "LEAD_ID_ISOLADO", confianca: ER_CONFIANCA_POR_TIPO.LEAD_ID_ISOLADO };
  }
  return { chave: `DEAL:${r.ID}`, tipo: "DEAL_ID_ISOLADO", confianca: ER_CONFIANCA_POR_TIPO.DEAL_ID_ISOLADO };
}

// ---- função pura principal --------------------------------------------------
//
// resolverMasterEntity(negocio, contexto) — dado um negócio/lead já carregado
// do Bitrix (mesmo formato usado por js/jornada.js) e o contexto da mesma
// extração, devolve um registro no formato do schema MASTER_ENTITY_ID acima.
//
// negocio: objeto do Bitrix (crm.deal por padrão, ou crm.lead quando
//   contexto.tipoRegistro === "LEAD"). Precisa de ID e, quando presentes,
//   COMPANY_ID/CONTACT_ID/LEAD_ID/TITLE (ou NAME+LAST_NAME para lead).
//
// contexto (todos os campos opcionais):
//   tipoRegistro          "NEGOCIO" (padrão) | "LEAD"
//   empresasPorId         map ID(string) -> registro crm.company já carregado
//                          (mesmo formato de buscarEntidadesPorIds em
//                          js/jornada.js) — usado só para o sinal de
//                          ambiguidade de cadastro (duplicidade de empresa),
//                          nunca para decidir a chave em si.
//   negociosDaExtracao    array de negócios/leads da MESMA extração (mesmo
//                          tipoRegistro, a menos que tipoRegistroExtracao seja
//                          informado) — usado para tornar source_record_ids[]
//                          explícito: todo registro cuja chave calculada bate
//                          com a do `negocio` de entrada entra na lista.
//                          Quando omitido, source_record_ids[] contém só o
//                          próprio `negocio`.
//   tipoRegistroExtracao  tipoRegistro dos itens de negociosDaExtracao, se
//                          diferente de tipoRegistro (raro; default = tipoRegistro)
//   empresa                "atlasgr" | "totaltrac" | outro identificador do
//                          portal de origem — preenche o campo `empresa` de
//                          cada source_record_ids[i]. Sem isso, fica null.
//   agora                 Date — para saída determinística em teste; default
//                          new Date().
//   criadoEmAnterior      string ISO — ver documentação do campo criado_em
//                          acima; sem uso hoje neste repositório.
//
// IMPORTANTE (custo): recalcula calcularChaveIdentidade() para cada item de
// negociosDaExtracao a cada chamada — O(n) por chamada. Chamar esta função
// uma vez por negócio dentro de um laço sobre toda uma extração é O(n²).
// Aceitável para o uso atual (função de formalização/teste, ainda não ligada
// a nenhum relatório real), mas uma futura integração em cockpit.js/sdr.js/
// catalogo-relatorios.js com volumes grandes deveria pré-agrupar por chave
// uma única vez (O(n)) em vez de chamar resolverMasterEntity em loop — ver
// "Riscos" no documento formalizado.
function resolverMasterEntity(negocio, contexto = {}) {
  if (!negocio || typeof negocio !== "object") {
    throw new Error("resolverMasterEntity: 'negocio' precisa ser um objeto de negócio/lead já carregado do Bitrix.");
  }

  const tipoRegistro = contexto.tipoRegistro === "LEAD" ? "LEAD" : "NEGOCIO";
  const tipoRegistroExtracao = contexto.tipoRegistroExtracao === "LEAD" || contexto.tipoRegistroExtracao === "NEGOCIO"
    ? contexto.tipoRegistroExtracao
    : tipoRegistro;
  const empresasPorId = contexto.empresasPorId || {};
  const empresaPortal = contexto.empresa || null;
  // Duck-typing em vez de `instanceof Date`: este módulo é carregado via
  // node:vm em teste (tests/entity-resolution.test.mjs), onde um objeto Date
  // construído no realm do chamador falha `instanceof Date` contra o Date do
  // realm do sandbox mesmo sendo, de fato, uma data. toISOString() é o único
  // método realmente usado abaixo, então checar por ele é suficiente e
  // funciona nos dois realms.
  const agora = contexto.agora && typeof contexto.agora.toISOString === "function" ? contexto.agora : new Date();
  const nowISO = agora.toISOString();
  const criadoEm = contexto.criadoEmAnterior || nowISO;

  const { chave, tipo, confianca } = calcularChaveIdentidade(negocio, { tipoRegistro });

  const entidadeRegistro = tipoRegistro === "LEAD" ? "LEAD" : "NEGOCIO";
  const conjuntoExtracao = Array.isArray(contexto.negociosDaExtracao) && contexto.negociosDaExtracao.length
    ? contexto.negociosDaExtracao
    : [negocio];

  // source_record_ids[] explícito: todo registro da extração cuja chave bate
  // com a do negócio de entrada (hoje implícito no agrupamento grupos[chave]
  // de js/jornada.js:941 — ver Wave 1, recomendação 2).
  const idPrincipal = String(negocio.ID ?? "");
  const vistos = new Set();
  const sourceRecords = [];
  const registrarSource = (entidade, id) => {
    const idStr = String(id ?? "");
    if (!idStr) return;
    const chaveVista = `${entidade}:${idStr}`;
    if (vistos.has(chaveVista)) return;
    vistos.add(chaveVista);
    sourceRecords.push({ entidade, id: idStr, empresa: empresaPortal });
  };

  conjuntoExtracao.forEach((r) => {
    const idAtual = String(r?.ID ?? "");
    if (!idAtual) return;
    const mesmaChave = idAtual === idPrincipal
      || calcularChaveIdentidade(r, { tipoRegistro: tipoRegistroExtracao }).chave === chave;
    if (mesmaChave) registrarSource(entidadeRegistro, idAtual);
  });
  // Garante que o próprio negócio de entrada sempre está presente, mesmo que
  // negociosDaExtracao não tenha sido informado ou não o contenha.
  registrarSource(entidadeRegistro, idPrincipal);

  // Âncora usada para a chave (quando aplicável) também entra explicitamente
  // em source_record_ids — não só a chave textual.
  if (tipo === "COMPANY_ID") {
    registrarSource("EMPRESA", erIdBitrixString(negocio.COMPANY_ID));
  } else if (tipo === "CONTACT_ID") {
    registrarSource("CONTATO", erIdBitrixString(negocio.CONTACT_ID));
  } else if (tipo === "LEAD_ID") {
    registrarSource("LEAD", erIdBitrixString(negocio.LEAD_ID));
  }

  // Sinal de ambiguidade cadastral: reaproveita erConstruirSinaisDuplicidadeEmpresas
  // (port de js/jornada.js:183-230) — nunca funde, só sinaliza para revisão.
  let ambiguidadeCadastral = false;
  if (tipo === "COMPANY_ID" && Object.keys(empresasPorId).length) {
    const sinais = erConstruirSinaisDuplicidadeEmpresas(empresasPorId);
    const idEmpresa = erIdBitrixString(negocio.COMPANY_ID);
    ambiguidadeCadastral = !!(sinais[idEmpresa] && sinais[idEmpresa].duplicado);
  }

  const manualReviewRequired = confianca === "BAIXA" || ambiguidadeCadastral;

  return {
    master_entity_id: chave,
    source_record_ids: sourceRecords,
    match_rules: [ER_MATCH_RULE_POR_TIPO[tipo]],
    confidence: confianca,
    manual_review_required: manualReviewRequired,
    criado_em: criadoEm,
    atualizado_em: nowISO
  };
}
