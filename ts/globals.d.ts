// ---------------------------------------------------------------------------
// Declarações ambiente para globals definidos em outros scripts clássicos
// (js/*.js, ainda não migrados para TypeScript) que ts/cockpit.ts usa em
// tempo de execução — no navegador, todos os <script> compartilham o mesmo
// escopo global, então essas funções já existem quando cockpit.js roda (ver
// ordem de <script> em cockpit.html). Aqui elas só ficam CONHECIDAS pelo
// compilador, com tipos propositalmente frouxos (`any`) — não é preguiça,
// é honestidade: tipar essas assinaturas de verdade é trabalho de quando
// CADA um desses arquivos for migrado (ver CLAUDE.md, seção "Migração
// incremental para TypeScript"), não algo pra inventar aqui sem ler o
// arquivo de origem com o mesmo cuidado.
// ---------------------------------------------------------------------------

declare const Chart: any;
declare let extracaoCancelada: boolean;

// Propriedades penduradas em `window` em tempo de execução (por este ou por
// outros scripts) — mesma lógica das funções acima: existe de verdade
// porque scripts clássicos compartilham o escopo global, só não é visível
// pro compilador de outra forma. Interface `Window` do lib.dom.d.ts aceita
// merge, por isso não precisa de `declare global` aqui.
interface Window {
  ULTIMA_CARGA_TEVE_CACHE?: boolean;
  Chart?: any;
  filtrarTabelaDrillDown?: (input: HTMLInputElement) => void;
  cockpitSalvarMetasIndividuais?: () => void;
}

declare function agruparReunioesPor(...args: any[]): any;
declare function aguardar(...args: any[]): Promise<void>;
declare function atualizarStatus(...args: any[]): void;
declare function baixarArquivo(...args: any[]): void;
declare function baseDealsCatalogo(...args: any[]): Promise<any>;
declare function baseLeadsCatalogo(...args: any[]): Promise<any>;
declare function bitrixFetchComRetentativa(...args: any[]): Promise<any>;
declare function bitrixPostJsonComRetentativa(...args: any[]): Promise<any>;
declare function buscarEntidadesPorIds(...args: any[]): Promise<any>;
declare function buscarReunioesFunilRelatorio(...args: any[]): Promise<any>;
declare function calcularIntervaloPreset(...args: any[]): any;
declare function carregarListaPaginada(...args: any[]): Promise<any[]>;
declare function chaveClienteDealModelo(deal: any): string;
declare function dataHoje(...args: any[]): string;
declare function dentroPeriodoCatalogo(valor: any, periodo: any): boolean;
declare function diferencaDiasAteReferencia(...args: any[]): number;
declare function ehDiaUtilISO(...args: any[]): boolean;
declare function ehEstagioPiloto(...args: any[]): boolean;
declare function encontrarCategoriasPorPalavras(...args: any[]): any[];
declare function enriquecerDealCatalogo(deal: any, base: any): any;
declare function escapeHtmlRelatorio(...args: any[]): string;
declare function esconderErro(...args: any[]): void;
declare function formatarDataBR(...args: any[]): string;
declare function formatarDataISO(...args: any[]): string;
declare function gerarHTMLRelatorioVisualGenerico(...args: any[]): string;
declare function iaAbrirModalAprofundamento(...args: any[]): void;
declare function idBitrixString(valor: any): string;
declare function idBitrixValido(valor: any): boolean;
declare function kpi(rotulo: string, valor: any, descricao?: string): any;
declare function linhasCSVDe(...args: any[]): string;
declare function listarCompletoRelatorio(...args: any[]): Promise<any>;
declare function mapaOrigensRelatorio(...args: any[]): Promise<any>;
declare function marcaAtiva(): any;
declare function mesAnoBR(...args: any[]): string;
declare function metaMensalPadrao(...args: any[]): number | null;
declare function modeloExecutivoCssParaMarca(...args: any[]): string;
declare function moedaRelatorio(valor: any): string;
declare function mostrarErro(...args: any[]): void;
declare function mostrarRelatorioVisualInline(...args: any[]): void;
declare function normalizarTextoChave(valor: any): string;
declare function obterWebhookSalvo(...args: any[]): string;
declare function parteDataISO(valor: any): string;
declare function probabilidadeFallbackForecast(...args: any[]): number;
declare function resumoReunioesFunilRelatorio(...args: any[]): any;
declare function revelarFluxoExtracao(...args: any[]): void;
declare function semanticaLead(...args: any[]): string;
declare function tabelaRelatorio(...args: any[]): string;
declare function taxaPct(...args: any[]): string;
declare function validarWebhook(webhook: any): string | null;
