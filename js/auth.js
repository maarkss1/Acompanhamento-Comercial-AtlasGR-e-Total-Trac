// ---------------------------------------------------------------------------
// v26 — Portal com senha única por navegador ("acesso restrito", pedido
// explícito do usuário). NÃO é segurança forte: a senha só é comparada como
// hash SHA-256 (nunca em texto puro) contra o que a pessoa digita, mas quem
// abrir o código-fonte pode tentar quebrar o hash por força bruta. Serve pra
// afastar acesso casual de quem não tem o link/senha — não para proteger
// dados sensíveis de verdade (não há dados sensíveis persistidos aqui além
// do que já é público no Bitrix da própria empresa).
//
// v27 — a empresa vem do `data-empresa` do próprio `<html>` da página (não
// de `marcaAtiva()`/`config.js`, que ainda não carregou neste ponto — auth.js
// é sempre o primeiro <script> de cada página). v35 — o portal serviu duas
// empresas (AtlasGR + Total Trac) até 2026-09-08; a chave por empresa em
// CHAVE_DESBLOQUEIO/CHAVE_USUARIO ficou porque não custa nada mantê-la e
// evita reintroduzir o bug que ela resolvia se um segundo tenant voltar um
// dia (ver archive/totaltrac-portal-completo pro portal como era antes).
//
// v34 — usuários nomeados com permissão de escrita individual. Antes, a
// mesma senha da empresa liberava tanto ler quanto ESCREVER de volta no
// Bitrix (crm.deal.update/crm.item.update em extracao.html,
// acompanhamento-financeiro.html, faturamento-mensal.html,
// temperatura-lead.html) — qualquer um com a senha da empresa podia marcar
// "Habilitar escrita" e alterar o CRM, sem nenhum registro de QUEM fez.
// Agora cada empresa tem uma LISTA de usuários (USUARIOS_POR_EMPRESA
// abaixo), cada um com sua própria senha e um flag `podeEscrever` — o login
// identifica qual usuário entrou (pelo hash que bateu) e guarda isso no
// localStorage. `usuarioAtual()` (global, usado por ui.js/temperatura-lead.js/
// faturamento-mensal.js/pipeline-financeiro-acompanhamento.js) expõe
// {nome, podeEscrever} pra essas telas travarem a escrita de quem não tem
// permissão — e pro log de auditoria (registrarAuditoriaSync, js/ui.js)
// registrar o nome de quem sincronizou.
//
// IMPORTANTE — o que isso NÃO resolve: o botão "Habilitar escrita" continua
// sendo um checkbox de JavaScript no navegador. Qualquer pessoa com acesso
// ao DevTools pode ignorá-lo e chamar a API do Bitrix diretamente, DESDE
// QUE também tenha a URL do webhook (que já fica salva em texto ofuscado
// no localStorage depois da primeira conexão — ver js/bitrix-api.js). A
// permissão que realmente protege o CRM é o escopo configurado no próprio
// webhook de entrada do Bitrix (Configurações > Webhooks): se o webhook
// usado por esta ferramenta só tiver permissão de LEITURA do CRM, nenhum
// código deste portal (nem um invasor que edite o JS no navegador) consegue
// escrever, não importa o que o checkbox diga. `podeEscrever` aqui é um
// controle de UX/auditoria (quem viu o botão, quem apareceu no log), não um
// substituto do escopo do webhook — configure os dois.
//
// Como adicionar/trocar um usuário: gere o hash SHA-256 da senha dele (ex.:
// no console do navegador, `await crypto.subtle.digest("SHA-256", new
// TextEncoder().encode("a-senha-dele"))` e converta pra hex, ou qualquer
// gerador de SHA-256 online) e adicione `{ nome: "...", senhaHash: "...",
// podeEscrever: true|false }` na lista abaixo. Senha padrão preservada da
// v26/v27 (mesma de antes, agora como o primeiro usuário, com
// podeEscrever:true pra não quebrar quem já sincronizava): "AtlasGR@2026".
// ---------------------------------------------------------------------------
const USUARIOS_POR_EMPRESA = {
  atlasgr: [
    { nome: "AtlasGR", senhaHash: "971b5af4a5fda505e27419910527bf48b52b754ca55cc34592a3ea6c4f466d7a", podeEscrever: true },
  ],
};

function chaveDesbloqueioEmpresa(empresa) {
  return "atlas-portal-auth-ok" + (empresa !== "atlasgr" ? "__" + empresa : "");
}
function chaveUsuarioEmpresa(empresa) {
  return "atlas-portal-usuario-atual" + (empresa !== "atlasgr" ? "__" + empresa : "");
}

// Global — usado fora deste arquivo (ui.js, temperatura-lead.js,
// faturamento-mensal.js, pipeline-financeiro-acompanhamento.js) para travar
// a escrita no Bitrix por usuário. Falha FECHADO por padrão: sessão sem
// usuário identificado (ex.: quem já estava logado antes desta mudança, ou
// localStorage corrompido) NÃO pode escrever até logar de novo — é
// proposital, nunca inverter esse default.
function usuarioAtual() {
  const empresa = document.documentElement.getAttribute("data-empresa") || "atlasgr";
  try {
    const bruto = localStorage.getItem(chaveUsuarioEmpresa(empresa));
    if (!bruto) return { nome: "Usuário não identificado", podeEscrever: false };
    const dados = JSON.parse(bruto);
    return { nome: String(dados?.nome || "Usuário não identificado"), podeEscrever: dados?.podeEscrever === true };
  } catch (e) {
    return { nome: "Usuário não identificado", podeEscrever: false };
  }
}

(function () {
  const empresa = document.documentElement.getAttribute("data-empresa") || "atlasgr";
  const USUARIOS = USUARIOS_POR_EMPRESA[empresa] || USUARIOS_POR_EMPRESA.atlasgr;
  const CHAVE_DESBLOQUEIO = chaveDesbloqueioEmpresa(empresa);
  const CHAVE_USUARIO = chaveUsuarioEmpresa(empresa);
  const gate = document.getElementById("loginGate");
  if (!gate) return; // pagina sem gate (nao deveria acontecer em nenhuma pagina do portal)

  function desbloquear() {
    document.body.classList.remove("aguardando-login");
    gate.classList.add("oculto");
  }

  let jaDesbloqueado = false;
  try { jaDesbloqueado = localStorage.getItem(CHAVE_DESBLOQUEIO) === "1"; } catch (e) {}
  if (jaDesbloqueado) { desbloquear(); return; }

  async function sha256Hex(texto) {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const form = document.getElementById("loginGateForm");
  const input = document.getElementById("loginGateSenha");
  const erro = document.getElementById("loginGateErro");
  if (!form || !input) return;

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    let hash;
    try {
      hash = await sha256Hex(input.value.trim());
    } catch (e) {
      erro.textContent = "Este navegador não suporta a verificação de senha (Web Crypto indisponível).";
      erro.classList.remove("oculto");
      return;
    }
    const usuario = USUARIOS.find((u) => u.senhaHash === hash);
    if (usuario) {
      try {
        localStorage.setItem(CHAVE_DESBLOQUEIO, "1");
        localStorage.setItem(CHAVE_USUARIO, JSON.stringify({ nome: usuario.nome, podeEscrever: usuario.podeEscrever === true }));
      } catch (e) {}
      desbloquear();
    } else {
      erro.textContent = "Senha incorreta. Tente novamente.";
      erro.classList.remove("oculto");
      input.value = "";
      input.focus();
    }
  });

  setTimeout(() => input.focus(), 60);
})();

// Link "🔒 Sair" na navegação — limpa o desbloqueio deste navegador e recarrega,
// voltando a pedir a senha. v27: cada empresa tem seu próprio flag (ver
// chaveDesbloqueioEmpresa acima) — sai só da empresa da página atual.
function sairDoPortal() {
  const empresa = document.documentElement.getAttribute("data-empresa") || "atlasgr";
  try {
    localStorage.removeItem(chaveDesbloqueioEmpresa(empresa));
    localStorage.removeItem(chaveUsuarioEmpresa(empresa));
  } catch (e) {}
  location.reload();
}
