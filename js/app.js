// =========================================================================
//  Bigode Pescador — ponto de entrada.
//
//  Ordem importa: carrega os dados locais, monta a tela, e só então liga a
//  sincronização. O app precisa estar utilizável antes de qualquer rede.
// =========================================================================

import {
  aoMudar,
  carregar,
  estado,
  garantirEtapaAberta,
  pescasAtivas,
  pescasDaEtapa,
} from "./estado.js";
import * as sync from "./sync.js";
import * as pwa from "./pwa.js";
import { aplicarConviteDaUrl, iniciarAjustes, renderizarAjustes } from "./ajustes.js";
import {
  abrirBemVindo,
  abrirModalPesca,
  iniciarBemVindo,
  iniciarEventosGlobais,
  iniciarModalEtapa,
  iniciarModalPeixe,
  iniciarModalPesca,
} from "./modais.js";
import {
  $,
  iniciarAbas,
  preencherSelectPescadores,
  preencherSelectPeixes,
  renderizarCabecalho,
  renderizarGeral,
  renderizarHistorico,
  renderizarPodio,
  renderizarRanking,
  toast,
  trocarAba,
} from "./ui.js";

async function iniciar() {
  try {
    await carregar();
  } catch (e) {
    console.error("[app] falhou ao carregar os dados:", e);
    toast("Não consegui abrir os dados guardados neste aparelho.", "erro");
  }

  // ---- Interface
  iniciarAbas();
  iniciarModalPesca();
  iniciarModalEtapa();
  iniciarModalPeixe();
  iniciarBemVindo();
  iniciarEventosGlobais();
  iniciarAjustes();
  pwa.iniciarInstalacao();

  $("#filtro-pescador").addEventListener("change", renderizarHistorico);
  $("#btn-atualizar-app").addEventListener("click", pwa.buscarAtualizacao);

  preencherSelectPescadores();
  preencherSelectPeixes();
  renderizarTelas();
  renderizarAjustes();

  // ---- Reage a qualquer mudança de estado
  // `motivos` é um Set: uma sincronização que baixa vários registros entrega
  // tudo de uma vez só, em vez de um redesenho por registro.
  aoMudar((motivos) => {
    if (motivos.has("pescadores") || motivos.has("eu")) preencherSelectPescadores();
    if (motivos.has("peixes")) preencherSelectPeixes();
    renderizarTelas();
    renderizarAjustes();
  });

  // ---- PWA e sincronização
  pwa.registrarServiceWorker();

  // Pede armazenamento protegido logo no boot: o pessoal registra peixe sem
  // sinal e bloqueia o celular, e a fila pode ficar horas esperando rede. Sem
  // isso o sistema tem permissão de apagar tudo se o espaço apertar.
  pwa.protegerArmazenamento();

  // Link de convite tem prioridade: pode ser a primeira vez deste aparelho.
  aplicarConviteDaUrl();

  // Sincroniza ANTES de garantir a etapa inicial: se outro aparelho já criou a
  // "1ª Etapa", baixamos a existente em vez de criar uma duplicada. A tela já
  // está no ar ("Nenhuma etapa") e assenta assim que o sync + a etapa chegam.
  if (sync.estaConfigurado() && navigator.onLine) {
    try {
      await sync.sincronizar({ silencioso: true });
    } catch (e) {
      console.warn("[app] sync inicial falhou:", e);
    }
  }
  await garantirEtapaAberta();
  sync.iniciar();

  // Clicar no link de convite com o app JÁ ABERTO só troca o fragmento da
  // URL — o navegador não recarrega nada e o convite passaria batido. É o
  // caso comum: o link chega no grupo e a pessoa está com o app na tela.
  window.addEventListener("hashchange", () => {
    if (aplicarConviteDaUrl()) sync.iniciar();
  });

  // ---- Primeira abertura: pergunta quem está usando
  if (!estado.eu) {
    abrirBemVindo();
  }

  const acao = pwa.lerAcaoDaUrl();

  // ---- Onde abrir
  // Entre duas pescarias a etapa corrente está criada e vazia, e a aba Etapa
  // seria uma tabela de zeros — péssima primeira tela para quem acabou de
  // entrar pelo link do grupo. Nesse caso abre no Pódio, que mostra o último
  // resultado de verdade. O atalho do ícone tem prioridade: quem tocou nele
  // já disse o que quer.
  if (!acao && pescasAtivas().length && !pescasDaEtapa(estado.etapaAtualId).length) {
    trocarAba("podio");
  }

  // ---- Atalho do ícone do app
  if (acao === "nova") {
    // Espera a tela assentar para o modal não abrir antes do render.
    setTimeout(() => abrirModalPesca(), 120);
  } else if (acao === "ranking") {
    trocarAba("campeonato");
  }

  // ---- Convite para levar o app para a tela inicial
  // Por último, e com uma folga: o "quem é você?" e o atalho do ícone também
  // abrem modal, e a explicação da instalação não pode atropelar nenhum dos
  // dois. Com os dois já na tela, o convite se contenta com a faixa.
  setTimeout(() => pwa.convidarParaInstalar(), 400);

  console.info("[app] Bigode Pescador pronto 🎣");
}

function renderizarTelas() {
  renderizarCabecalho();
  renderizarRanking();
  renderizarPodio();
  renderizarHistorico();
  renderizarGeral();
}

// Erros não tratados não podem deixar a tela em branco sem explicação.
window.addEventListener("error", (e) => {
  console.error("[app] erro não tratado:", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[app] promessa rejeitada:", e.reason);
});

iniciar();
