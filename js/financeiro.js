// ---------------------------------------------------------------------------
// Persistência local de faturamentos (Financeiro × Comercial)
// ---------------------------------------------------------------------------
// Por não haver backend, armazenamos os registros financeiros no localStorage,
// atrelados à empresa configurada na página (data-empresa).
//
// O modelo permite múltiplos registros de faturamento (NFs) por negócio (deal).

const CHAVE_FATURAMENTOS = "atlas-extrator-faturamentos";

function getSufixoEmpresaFinanceiro() {
  const emp = document.documentElement.getAttribute("data-empresa");
  return emp === "totaltrac" ? "__totaltrac" : "";
}

function getChaveFaturamentos() {
  return CHAVE_FATURAMENTOS + getSufixoEmpresaFinanceiro();
}

/**
 * Retorna todos os registros de faturamento salvos.
 */
function getFaturamentos() {
  try {
    const data = localStorage.getItem(getChaveFaturamentos());
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Erro ao ler faturamentos do localStorage:", e);
    return [];
  }
}

/**
 * Retorna faturamentos de um negócio específico.
 */
function getFaturamentosPorNegocio(negocioId) {
  const faturamentos = getFaturamentos();
  return faturamentos.filter(f => String(f.bitrix_id) === String(negocioId));
}

/**
 * Salva um novo registro de faturamento.
 * faturamento = {
 *   id_interno, bitrix_id, cliente, valor_vendido, valor_faturado,
 *   data_faturamento, numero_nf, data_nf, observacao, usuario,
 *   data_criacao, data_alteracao
 * }
 */
function saveFaturamento(faturamento) {
  const faturamentos = getFaturamentos();
  const index = faturamentos.findIndex(f => f.id_interno === faturamento.id_interno);

  if (index >= 0) {
    faturamentos[index] = { ...faturamentos[index], ...faturamento, data_alteracao: new Date().toISOString() };
  } else {
    faturamentos.push({
      ...faturamento,
      id_interno: faturamento.id_interno || crypto.randomUUID(),
      data_criacao: new Date().toISOString(),
      data_alteracao: new Date().toISOString()
    });
  }

  try {
    localStorage.setItem(getChaveFaturamentos(), JSON.stringify(faturamentos));
  } catch (e) {
    console.error("Erro ao salvar faturamento no localStorage:", e);
    alert("Não foi possível salvar o faturamento. O armazenamento local pode estar cheio.");
  }
}

/**
 * Calcula os totais de faturamento para uma lista de negócios.
 * Retorna um mapa indexado por ID do negócio.
 */
function agruparFaturamentosPorNegocio() {
  const faturamentos = getFaturamentos();
  const mapa = {};

  faturamentos.forEach(f => {
    const id = String(f.bitrix_id);
    if (!mapa[id]) {
      mapa[id] = {
        faturado: 0,
        nfs: 0,
        registros: []
      };
    }
    const val = Number(f.valor_faturado) || 0;
    mapa[id].faturado += val;
    mapa[id].nfs++;
    mapa[id].registros.push(f);
  });

  return mapa;
}
