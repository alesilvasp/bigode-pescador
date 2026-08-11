// =========================================================================
//  PWA — service worker, instalação e atalhos.
// =========================================================================

import { $, avisoComAcao, toast } from "./ui.js";

let promptInstalacao = null;
let registroSW = null;

// ---- Service worker --------------------------------------------------------

export async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // Só funciona em HTTPS ou localhost. Abrindo o arquivo direto (file://) não vai.
  if (location.protocol === "file:") {
    console.info("[pwa] rodando em file:// — service worker desativado");
    return;
  }

  // Na primeira visita o clients.claim() do service worker também dispara
  // "controllerchange". Sem esta marca, o app recarregaria sozinho logo ao
  // abrir pela primeira vez — um piscar sem motivo. Só interessa recarregar
  // quando um controller EXISTENTE é trocado por uma versão nova.
  const jaTinhaControlador = !!navigator.serviceWorker.controller;

  try {
    registroSW = await navigator.serviceWorker.register("service-worker.js");

    let recarregando = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!jaTinhaControlador || recarregando) return;
      recarregando = true;
      location.reload();
    });

    registroSW.addEventListener("updatefound", () => {
      const novo = registroSW.installing;
      if (!novo) return;
      novo.addEventListener("statechange", () => {
        // Instalou e já havia um SW ativo = é atualização, não primeira visita.
        if (novo.state === "installed" && navigator.serviceWorker.controller) {
          oferecerAtualizacao(novo);
        }
      });
    });

    // Checa atualização quando o app volta ao primeiro plano.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registroSW.update().catch(() => {});
    });
  } catch (e) {
    console.warn("[pwa] service worker não registrou:", e);
  }
}

function oferecerAtualizacao(worker) {
  avisoComAcao(
    `Nova versão disponível. <button id="btn-recarregar" class="link-toast">atualizar</button>`
  );

  $("#btn-recarregar").addEventListener("click", () => {
    worker.postMessage({ tipo: "ASSUMIR_CONTROLE" });
  });
}

/** Verificação manual, pelo botão em Ajustes. */
export async function buscarAtualizacao() {
  if (!registroSW) {
    toast("Service worker não está ativo aqui.", "erro");
    return;
  }
  try {
    await registroSW.update();

    // `update()` termina com sucesso TAMBÉM quando encontra uma versão nova —
    // quem avisa é o evento `updatefound`, que chega depois. Sem esta checagem
    // o botão respondia "já está na versão mais recente" justamente no momento
    // em que tinha acabado de baixar uma, e a pessoa desistia de atualizar.
    if (registroSW.installing || registroSW.waiting) {
      toast("Versão nova encontrada — baixando…");
      return;
    }

    toast("Já está na versão mais recente.");
  } catch {
    toast("Não consegui verificar agora.", "erro");
  }
}

// ---- Instalação ------------------------------------------------------------

export function iniciarInstalacao() {
  const botao = $("#btn-instalar");

  // Android/Chrome: o navegador avisa quando dá para instalar.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptInstalacao = e;
    botao.classList.remove("oculto");
  });

  window.addEventListener("appinstalled", () => {
    promptInstalacao = null;
    botao.classList.add("oculto");
    toast("App instalado! 🎣");
  });

  botao.addEventListener("click", async () => {
    // iOS não expõe beforeinstallprompt — só dá para explicar o caminho.
    if (!promptInstalacao) {
      mostrarInstrucaoIos();
      return;
    }
    promptInstalacao.prompt();
    const { outcome } = await promptInstalacao.userChoice;
    if (outcome === "accepted") botao.classList.add("oculto");
    promptInstalacao = null;
  });

  // No iPhone, mostra o botão mesmo sem o evento, para caber a instrução.
  if (ehIos() && !estaInstalado()) botao.classList.remove("oculto");
}

function mostrarInstrucaoIos() {
  if (ehIos()) {
    alert(
      "Para instalar no iPhone:\n\n" +
        "1. Toque no botão Compartilhar (o quadrado com a seta para cima)\n" +
        "2. Role e toque em \"Adicionar à Tela de Início\"\n" +
        "3. Toque em \"Adicionar\"\n\n" +
        "Precisa ser pelo Safari — no Chrome do iPhone não aparece a opção."
    );
  } else {
    alert(
      "Para instalar:\n\n" +
        "Abra o menu do navegador (⋮) e escolha \"Instalar app\" ou \"Adicionar à tela inicial\"."
    );
  }
}

export const ehIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS 13+ se apresenta como Mac; o toque desempata.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const estaInstalado = () =>
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

// ---- Atalhos ---------------------------------------------------------------

/**
 * Atalho do ícone do app: `?acao=nova` abre o formulário direto.
 *
 * É o que o Felipe pediu no grupo — segurar o ícone na tela inicial e já cair
 * no "+", sem passar pela lista.
 */
export function lerAcaoDaUrl() {
  const params = new URLSearchParams(location.search);
  const acao = params.get("acao");
  if (acao) {
    // Limpa para um F5 não repetir a ação.
    history.replaceState(null, "", location.pathname);
  }
  return acao;
}
