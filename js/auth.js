// ---------------------------------------------------------------------------
// v26 — Portal com senha única por navegador ("acesso restrito", pedido
// explícito do usuário). NÃO é segurança forte: a senha só é comparada como
// hash SHA-256 (nunca em texto puro) contra o que a pessoa digita, mas quem
// abrir o código-fonte pode tentar quebrar o hash por força bruta. Serve pra
// afastar acesso casual de quem não tem o link/senha — não para proteger
// dados sensíveis de verdade (não há dados sensíveis persistidos aqui além
// do que já é público no Bitrix da própria empresa).
//
// Como trocar a senha: gere o hash SHA-256 da nova senha (ex.: no console do
// navegador, `await crypto.subtle.digest("SHA-256", new
// TextEncoder().encode("nova-senha"))` e converta pra hex, ou qualquer
// gerador de SHA-256 online) e troque o valor de SENHA_HASH abaixo. Senha
// padrão configurada: "AtlasGR@2026".
// ---------------------------------------------------------------------------
(function () {
  const SENHA_HASH = "971b5af4a5fda505e27419910527bf48b52b754ca55cc34592a3ea6c4f466d7a";
  const CHAVE_DESBLOQUEIO = "atlas-portal-auth-ok";
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
    if (hash === SENHA_HASH) {
      try { localStorage.setItem(CHAVE_DESBLOQUEIO, "1"); } catch (e) {}
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
// voltando a pedir a senha.
function sairDoPortal() {
  try { localStorage.removeItem("atlas-portal-auth-ok"); } catch (e) {}
  location.reload();
}
