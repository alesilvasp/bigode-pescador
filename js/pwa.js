// =========================================================================
//  PWA — service worker, instalação e atalhos.
// =========================================================================

import { CHAVES } from "./config.js";
import { $, abrir, avisoComAcao, fechar, temModalAberto, toast } from "./ui.js";

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
    // O evento costuma chegar DEPOIS do modal já estar aberto: se for o caso,
    // troca a instrução manual pelo botão que instala de verdade.
    if (!$("#modal-instalar").classList.contains("oculto")) desenharModalInstalar();
  });

  window.addEventListener("appinstalled", () => {
    promptInstalacao = null;
    botao.classList.add("oculto");
    esconderConvite();
    fechar("#modal-instalar");
    toast("Instalado! Pode fechar o navegador e abrir pelo ícone. 🎣");
  });

  botao.addEventListener("click", abrirComoInstalar);

  // No iPhone, mostra o botão mesmo sem o evento: lá a instalação é manual e
  // o botão existe só para caber a explicação.
  if (ehIos() && !estaInstalado()) botao.classList.remove("oculto");

  iniciarConvite();
  iniciarModalInstalar();
}

// ---- O convite que aparece ao abrir o link ---------------------------------
//
//  Quem chega pelo link no grupo cai no navegador, e ali o app parece um site
//  qualquer — sem ícone, com a barra do Chrome comendo a tela e, o que importa
//  de verdade, sem a garantia de abrir na beira do rio. A faixa existe para
//  contar isso. Ela some para quem já instalou e para quem dispensou.

const DIAS_ATE_INSISTIR = 14;

function iniciarConvite() {
  $("#btn-convite-ver").addEventListener("click", abrirComoInstalar);

  $("#btn-convite-depois").addEventListener("click", () => {
    localStorage.setItem(CHAVES.conviteInstalar, String(Date.now()));
    esconderConvite();
    toast("Beleza. Quando quiser, o botão fica em Ajustes.");
  });
}

const esconderConvite = () => $("#convite-instalar").classList.add("oculto");

/** Vale a pena convidar este aparelho? */
function cabeConvite() {
  if (estaInstalado()) return false;
  if (location.protocol === "file:") return false;

  // Num PC o app até instala, mas o ganho real — offline no rio, ícone na mão —
  // é do celular. Convida só quem está com o dedo na tela.
  if (!ehCelular()) return false;

  const dispensadoEm = Number(localStorage.getItem(CHAVES.conviteInstalar)) || 0;
  if (!dispensadoEm) return true;
  return Date.now() - dispensadoEm >= DIAS_ATE_INSISTIR * 86400000;
}

/** Chamado no fim do boot. Mostra a faixa e, na primeira vez, explica tudo. */
export function convidarParaInstalar() {
  if (!cabeConvite()) return;

  $("#convite-instalar").classList.remove("oculto");

  // A primeira visita ganha a explicação inteira, uma vez só na vida do
  // aparelho. Se o "quem é você?" estiver na frente, fica só a faixa —
  // empilhar dois modais logo na primeira abertura é atropelo.
  if (localStorage.getItem(CHAVES.jaEnsinouInstalar) || temModalAberto()) return;
  localStorage.setItem(CHAVES.jaEnsinouInstalar, "1");
  abrirComoInstalar();
}

// ---- O modal que ensina o caminho ------------------------------------------

function iniciarModalInstalar() {
  $("#btn-instalar-fechar").addEventListener("click", () => fechar("#modal-instalar"));

  $("#modal-instalar").addEventListener("click", (e) => {
    if (e.target.id === "modal-instalar") fechar("#modal-instalar");
  });

  $("#btn-instalar-agora").addEventListener("click", async () => {
    if (!promptInstalacao) return;

    promptInstalacao.prompt();
    const { outcome } = await promptInstalacao.userChoice;

    // O evento só serve uma vez: usado, o navegador não o devolve.
    promptInstalacao = null;
    $("#btn-instalar-agora").classList.add("oculto");

    if (outcome === "accepted") {
      fechar("#modal-instalar");
    } else {
      // Recusou: troca o botão pela instrução manual, senão o modal fica
      // sem nenhum caminho para seguir.
      desenharModalInstalar();
      toast("Sem problema. O convite continua em Ajustes.");
    }
  });
}

export function abrirComoInstalar() {
  desenharModalInstalar();
  abrir("#modal-instalar");
}

function desenharModalInstalar() {
  $("#passos-instalar").innerHTML = passosDaPlataforma();
  $("#btn-instalar-agora").classList.toggle("oculto", !promptInstalacao);
}

function passosDaPlataforma() {
  if (ehIos()) {
    // Chrome e Firefox no iPhone não têm "Adicionar à Tela de Início". É
    // limitação do iOS, e sem avisar a pessoa procura um menu que não existe.
    if (!ehSafari()) {
      return `
        <h3>No iPhone, tem que ser pelo Safari</h3>
        <ol>
          <li>Abra <strong>bigode-pescador.vercel.app</strong> no <strong>Safari</strong>.</li>
          <li>Toque em <strong>Compartilhar</strong>, o quadrado com a seta para cima.</li>
          <li>Role e toque em <strong>Adicionar à Tela de Início</strong>.</li>
        </ol>
        <p class="aviso">Neste navegador a opção não aparece — é restrição do iPhone, não do app.</p>`;
    }
    return `
      <h3>No iPhone</h3>
      <ol>
        <li>Toque em <strong>Compartilhar</strong> — o quadrado com a seta para cima, na barra de baixo.</li>
        <li>Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.</li>
        <li>Toque em <strong>Adicionar</strong>, no canto de cima.</li>
      </ol>`;
  }

  if (promptInstalacao) {
    return `
      <h3>No Android</h3>
      <ol>
        <li>Toque em <strong>Instalar agora</strong>, aqui embaixo.</li>
        <li>Confirme em <strong>Instalar</strong>.</li>
      </ol>`;
  }

  return `
    <h3>No Android</h3>
    <ol>
      <li>Abra o menu do navegador — o <strong>⋮</strong> no canto de cima.</li>
      <li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
    </ol>`;
}

/** Safari de verdade: os outros navegadores do iPhone se anunciam no UA. */
const ehSafari = () => !/crios|fxios|edgios|opt\//i.test(navigator.userAgent);

/** Tela de toque e estreita. É para quem o convite faz diferença. */
const ehCelular = () =>
  window.matchMedia("(pointer: coarse)").matches &&
  window.matchMedia("(max-width: 900px)").matches;

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
