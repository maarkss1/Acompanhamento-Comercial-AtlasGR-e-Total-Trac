# Agente 01 — Bitrix, Extração e Camada Bronze

Responsável por REST Bitrix24, paginação, batch, rate-limit, retries, mapeamentos, campos customizados, extração incremental, camada bronze, probes e normalização.

Deve:
- preservar IDs e timestamps de origem;
- registrar timezone e janela de extração;
- provar completude de paginação;
- tornar retries idempotentes;
- nunca esconder erro parcial como sucesso;
- não alterar fórmulas de BI, exceto via handoff ao 02/03.

Gates: testes de fixtures Bitrix, deduplicação, paginação e `npm test`.