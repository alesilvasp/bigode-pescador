// =========================================================================
//  Modais — formulários de pesca, etapa, peixe e boas-vindas.
// =========================================================================

import { OPCAO_NOVO } from "./config.js";
import {
  adicionarPesca,
  atualizarEtapa,
  atualizarPesca,
  criarEtapa,
  definirEtapaAtual,
  definirEu,
  estado,
  etapaAtual,
  etapasAtivas,
  hoje,
  peixePorNome,
  removerEtapa,
  removerPesca,
  salvarPeixe,
} from "./estado.js";
import { calcularPontuacao, explicarPontuacao } from "./pontuacao.js";
import { urlDaFoto } from "./db.js";
import {
  $,
  $$,
  esc,
  formatarDataCurta,
  preencherSelectPeixes,
  toast,
} from "./ui.js";

// ---- Estado local dos formulários -----------------------------------------

let unidadePeso = "kg";
let fotoAtual = null; // Blob da foto escolhida agora
let fotoRemovida = false; // marcou para remover a foto existente
let pescaEmEdicao = null;
let etapaEmEdicao = null;
let peixeEmEdicao = null;
let urlPreview = null;

// ---- Utilidades ------------------------------------------------------------

function abrir(idModal) {
  $(idModal).classList.remove("oculto");
  document.body.classList.add("travado");
}

function fechar(idModal) {
  $(idModal).classList.add("oculto");
  if (!$$(".modal:not(.oculto)").length) document.body.classList.remove("travado");
}

/**
 * Reduz a imagem num canvas e devolve um Blob JPEG.
 *
 * Blob em vez do dataURL da v1: ocupa ~33% menos espaço no IndexedDB e não
 * precisa passar por string gigante na memória.
 */
export function comprimirImagem(file, maxLado = 1280, qualidade = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("canvas vazio"))),
          "image/jpeg",
          qualidade
        );
      };
      img.onerror = () => reject(new Error("imagem inválida"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// =========================================================================
//  Modal de pesca
// =========================================================================

/**
 * Devolve ao select o pescador da pesca em edição, mesmo que ele já não esteja
 * na lista.
 *
 * Sem isto, editar a pesca de alguém removido deixava o campo VAZIO: como ele
 * é obrigatório, ou o formulário travava sem explicar, ou a pessoa escolhia
 * outro nome e a pesca trocava de dono em silêncio.
 */
function garantirOpcaoPescador(nome) {
  if (!nome) return;
  const select = $("#campo-pescador");
  if ([...select.options].some((o) => o.value === nome)) return;

  const opcao = document.createElement("option");
  opcao.value = nome;
  opcao.textContent = `${nome} (fora da lista)`;
  select.appendChild(opcao);
}

export async function abrirModalPesca(pesca = null) {
  const etapa = etapaAtual();
  if (!etapa) {
    toast("Crie uma etapa antes de registrar uma pesca.", "erro");
    abrirModalEtapa();
    return;
  }

  // Sem ninguém na lista não há como registrar: o campo é obrigatório e o
  // formulário travaria sem dizer por quê.
  if (!pesca && !estado.pescadores.length) {
    toast("Adicione ao menos um pescador em Ajustes.", "erro");
    return;
  }

  pescaEmEdicao = pesca;
  fotoAtual = null;
  fotoRemovida = false;
  limparPreviewFoto();

  $("#titulo-modal-pesca").textContent = pesca ? "Editar pesca" : "Nova pesca";
  $("#form-pesca").reset();
  $("#bloco-novo-peixe").classList.add("oculto");
  preencherSelectPeixes();

  if (pesca) {
    garantirOpcaoPescador(pesca.pescador);
    $("#campo-pescador").value = pesca.pescador;
    preencherSelectPeixes(pesca.tipo);
    unidadePeso = pesca.pesoGramas >= 1000 ? "kg" : "g";
    $("#campo-peso").value =
      unidadePeso === "kg" ? (pesca.pesoGramas / 1000).toFixed(2) : Math.round(pesca.pesoGramas);
    ajustarEscalaTamanho(pesca.tamanho);
    $("#campo-tamanho").value = pesca.tamanho;
    $("#campo-tamanho-exato").value = pesca.tamanho;

    if (pesca.fotoId) {
      const url = await urlDaFoto(pesca.fotoId);
      if (url) mostrarPreviewFoto(url);
    }
  } else {
    // Pré-seleciona quem está usando o aparelho — na pesca, um toque a menos.
    if (estado.eu) $("#campo-pescador").value = estado.eu;
    unidadePeso = estado.ajustes.unidadePesoPadrao || "kg";
    ajustarEscalaTamanho();
    $("#campo-tamanho").value = 30;
    $("#campo-tamanho-exato").value = 30;
  }

  sincronizarToggleUnidade();
  atualizarModoMedidas();
  atualizarPreviewPontuacao();
  abrir("#modal-pesca");

  // Foco no peixe: pescador quase sempre já está certo.
  setTimeout(() => $("#campo-tipo").focus(), 80);
}

function limparPreviewFoto() {
  if (urlPreview) {
    URL.revokeObjectURL(urlPreview);
    urlPreview = null;
  }
  $("#foto-preview").classList.add("oculto");
  $("#foto-preview-img").removeAttribute("src");
}

function mostrarPreviewFoto(url) {
  urlPreview = url;
  $("#foto-preview-img").src = url;
  $("#foto-preview").classList.remove("oculto");
}

function sincronizarToggleUnidade() {
  $$(".toggle-unidade .un").forEach((b) => b.classList.toggle("ativa", b.dataset.un === unidadePeso));
}

/**
 * Ajusta o fim da régua ao maior peixe que já apareceu.
 *
 * O slider era fixo em 100 cm e o `tamanhoMaximo` dos ajustes nunca era usado:
 * um robalo de 1,20 m virava 1,00 m em silêncio, porque o range simplesmente
 * corta o que passa do máximo. Agora a régua cresce, e o campo digitado não
 * tem teto nenhum.
 */
function ajustarEscalaTamanho(valorAtual = 0) {
  const slider = $("#campo-tamanho");
  const configurado = Number(estado.ajustes.tamanhoMaximo) || 100;
  const maior = estado.pescas.reduce((m, p) => Math.max(m, Number(p.tamanho) || 0), 0);

  // Arredonda para cima na dezena, para a régua não terminar num número torto.
  const teto = Math.max(configurado, Math.ceil(Math.max(maior, valorAtual) / 10) * 10);
  slider.max = String(teto);

  $("#slider-escala").innerHTML = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => `<i>${Math.round(teto * f)}</i>`)
    .join("");
}

/** Mantém o slider e o campo digitável mostrando o mesmo número. */
function sincronizarTamanho(origem) {
  const slider = $("#campo-tamanho");
  const exato = $("#campo-tamanho-exato");

  if (origem === "exato") {
    const v = Math.max(0, parseFloat(exato.value) || 0);
    ajustarEscalaTamanho(v); // digitou algo maior que a régua? ela cresce
    slider.value = String(v);
  } else {
    exato.value = String(parseFloat(slider.value) || 0);
  }
}

/** Valor de tamanho que vale para salvar: o digitado é a fonte da verdade. */
function tamanhoDigitado() {
  return Math.max(0, parseFloat($("#campo-tamanho-exato").value) || 0);
}

/** Peixe de pontuação fixa não usa peso nem tamanho — esconde os campos. */
function atualizarModoMedidas() {
  const nome = $("#campo-tipo").value;
  const ehNovo = nome === OPCAO_NOVO;
  const modo = ehNovo ? $("#campo-novo-modo").value : peixePorNome(nome)?.modo;
  $("#bloco-medidas").classList.toggle("oculto", modo === "fixa");
}

function peixeDoFormulario() {
  const nome = $("#campo-tipo").value;
  if (nome !== OPCAO_NOVO) return peixePorNome(nome);

  const modo = $("#campo-novo-modo").value;
  return {
    nome: $("#campo-novo-nome").value.trim() || "Novo peixe",
    modo,
    fator: parseFloat($("#campo-novo-fator").value) || 0,
    pontosFixos: parseFloat($("#campo-novo-fixos").value) || 0,
  };
}

function pesoEmGramas() {
  const v = parseFloat($("#campo-peso").value) || 0;
  return unidadePeso === "kg" ? v * 1000 : v;
}

function atualizarPreviewPontuacao() {
  const peixe = peixeDoFormulario();
  const tamanho = tamanhoDigitado();
  const peso = pesoEmGramas();

  $("#preview-pontuacao").textContent = new Intl.NumberFormat("pt-BR").format(
    calcularPontuacao(peixe, peso, tamanho, estado.ajustes)
  );
  $("#preview-conta").textContent = explicarPontuacao(peixe, peso, tamanho, estado.ajustes);
}

export function iniciarModalPesca() {
  $("#btn-adicionar").addEventListener("click", () => abrirModalPesca());
  $("#btn-cancelar").addEventListener("click", () => fecharModalPesca());

  $("#modal-pesca").addEventListener("click", (e) => {
    if (e.target.id === "modal-pesca") fecharModalPesca();
  });

  $("#campo-tipo").addEventListener("change", () => {
    const ehNovo = $("#campo-tipo").value === OPCAO_NOVO;
    $("#bloco-novo-peixe").classList.toggle("oculto", !ehNovo);
    atualizarModoMedidas();
    atualizarPreviewPontuacao();
  });

  $("#campo-novo-modo").addEventListener("change", () => {
    const fixa = $("#campo-novo-modo").value === "fixa";
    $("#rotulo-novo-fator").classList.toggle("oculto", fixa);
    $("#rotulo-novo-fixos").classList.toggle("oculto", !fixa);
    atualizarModoMedidas();
    atualizarPreviewPontuacao();
  });

  $$(".toggle-unidade .un").forEach((btn) => {
    btn.addEventListener("click", () => {
      unidadePeso = btn.dataset.un;
      sincronizarToggleUnidade();
      atualizarPreviewPontuacao();
    });
  });

  $("#campo-tamanho").addEventListener("input", () => {
    sincronizarTamanho("slider");
    atualizarPreviewPontuacao();
  });

  $("#campo-tamanho-exato").addEventListener("input", () => {
    sincronizarTamanho("exato");
    atualizarPreviewPontuacao();
  });

  ["#campo-peso", "#campo-novo-fator", "#campo-novo-fixos"].forEach((sel) =>
    $(sel).addEventListener("input", atualizarPreviewPontuacao)
  );

  $("#campo-foto").addEventListener("change", async () => {
    const file = $("#campo-foto").files[0];
    if (!file) return;
    try {
      fotoAtual = await comprimirImagem(file);
      fotoRemovida = false;
      limparPreviewFoto();
      mostrarPreviewFoto(URL.createObjectURL(fotoAtual));
    } catch {
      toast("Não consegui ler essa imagem.", "erro");
    }
  });

  $("#btn-remover-foto").addEventListener("click", () => {
    fotoAtual = null;
    fotoRemovida = true;
    $("#campo-foto").value = "";
    limparPreviewFoto();
  });

  $("#form-pesca").addEventListener("submit", salvarFormularioPesca);
}

function fecharModalPesca() {
  limparPreviewFoto();
  pescaEmEdicao = null;
  fechar("#modal-pesca");
}

async function salvarFormularioPesca(e) {
  e.preventDefault();

  let tipo = $("#campo-tipo").value;

  // Cadastro de peixe novo feito dentro do formulário de pesca.
  if (tipo === OPCAO_NOVO) {
    const nome = $("#campo-novo-nome").value.trim();
    const modo = $("#campo-novo-modo").value;
    const fator = parseFloat($("#campo-novo-fator").value);
    const fixos = parseFloat($("#campo-novo-fixos").value);

    if (!nome) {
      toast("Dê um nome ao peixe novo.", "erro");
      return;
    }
    if (modo === "formula" && Number.isNaN(fator)) {
      toast("Informe o fator do peixe novo.", "erro");
      return;
    }
    if (modo === "fixa" && Number.isNaN(fixos)) {
      toast("Informe quantos pontos fixos esse peixe vale.", "erro");
      return;
    }
    if (peixePorNome(nome)) {
      toast("Já existe um peixe com esse nome.", "erro");
      return;
    }

    await salvarPeixe({ nome, modo, fator: fator || 0, pontosFixos: fixos || 0 });
    preencherSelectPeixes(nome);
    tipo = nome;
  }

  const peixe = peixePorNome(tipo);
  const ehFixa = peixe?.modo === "fixa";
  const peso = ehFixa ? 0 : pesoEmGramas();
  const tamanho = ehFixa ? 0 : tamanhoDigitado();

  if (!ehFixa && peso <= 0) {
    toast("Informe o peso do peixe.", "erro");
    $("#campo-peso").focus();
    return;
  }

  try {
    if (pescaEmEdicao) {
      const campos = { pescador: $("#campo-pescador").value, tipo, pesoGramas: peso, tamanho };
      if (fotoAtual) campos.foto = fotoAtual;
      else if (fotoRemovida) campos.foto = null;
      await atualizarPesca(pescaEmEdicao.id, campos);
      toast("Pesca atualizada.");
    } else {
      await adicionarPesca({
        etapaId: etapaAtual().id,
        pescador: $("#campo-pescador").value,
        tipo,
        pesoGramas: peso,
        tamanho,
        foto: fotoAtual,
      });
      toast("Peixe registrado! 🎣");
    }
    fecharModalPesca();
  } catch (erro) {
    console.error(erro);
    toast("Não consegui salvar. Tente de novo.", "erro");
  }
}

// =========================================================================
//  Modal de etapa
// =========================================================================

export function abrirModalEtapa(etapa = null) {
  etapaEmEdicao = etapa;
  $("#titulo-modal-etapa").textContent = etapa ? "Editar etapa" : "Nova etapa";
  $("#campo-etapa-nome").value = etapa?.nome ?? "";
  $("#campo-etapa-local").value = etapa?.local ?? "";
  $("#campo-etapa-data").value = etapa?.data ?? hoje();
  $("#campo-etapa-encerrada").checked = !!etapa?.encerrada;
  abrir("#modal-etapa");
  setTimeout(() => $("#campo-etapa-nome").focus(), 80);
}

export function iniciarModalEtapa() {
  $("#btn-etapa-cancelar").addEventListener("click", () => fechar("#modal-etapa"));
  $("#modal-etapa").addEventListener("click", (e) => {
    if (e.target.id === "modal-etapa") fechar("#modal-etapa");
  });

  $("#form-etapa").addEventListener("submit", async (e) => {
    e.preventDefault();
    const dados = {
      nome: $("#campo-etapa-nome").value.trim(),
      local: $("#campo-etapa-local").value.trim(),
      data: $("#campo-etapa-data").value || hoje(),
      encerrada: $("#campo-etapa-encerrada").checked,
    };

    if (!dados.nome) {
      toast("Dê um nome à etapa.", "erro");
      return;
    }

    if (etapaEmEdicao) {
      await atualizarEtapa(etapaEmEdicao.id, dados);
      toast("Etapa atualizada.");
    } else {
      await criarEtapa(dados);
      toast("Etapa criada.");
    }

    etapaEmEdicao = null;
    fechar("#modal-etapa");
  });

  // Seletor de etapa no cabeçalho.
  $("#seletor-etapa").addEventListener("click", abrirEscolherEtapa);
  $("#btn-escolher-cancelar").addEventListener("click", () => fechar("#modal-escolher-etapa"));
  $("#btn-escolher-nova").addEventListener("click", () => {
    fechar("#modal-escolher-etapa");
    abrirModalEtapa();
  });
  $("#modal-escolher-etapa").addEventListener("click", (e) => {
    if (e.target.id === "modal-escolher-etapa") fechar("#modal-escolher-etapa");
  });
  $("#btn-nova-etapa").addEventListener("click", () => abrirModalEtapa());
}

function abrirEscolherEtapa() {
  const etapas = etapasAtivas();
  $("#opcoes-etapa").innerHTML = etapas
    .map(
      (e) => `
      <button type="button" class="opcao-etapa ${e.id === estado.etapaAtualId ? "ativa" : ""}"
              data-escolher="${esc(e.id)}">
        <span class="opcao-nome">${esc(e.nome)}${e.encerrada ? " 🔒" : ""}</span>
        <span class="opcao-sub">${esc(formatarDataCurta(e.data))}${e.local ? ` · ${esc(e.local)}` : ""}</span>
      </button>`
    )
    .join("");
  abrir("#modal-escolher-etapa");
}

// =========================================================================
//  Modal de peixe (tela de Ajustes)
// =========================================================================

export function abrirModalPeixe(peixe = null) {
  peixeEmEdicao = peixe;
  $("#titulo-modal-peixe").textContent = peixe ? "Editar peixe" : "Novo peixe";
  $("#campo-peixe-nome").value = peixe?.nome ?? "";
  $("#campo-peixe-nome").disabled = !!peixe; // nome é a chave: não muda
  $("#campo-peixe-modo").value = peixe?.modo ?? "formula";
  $("#campo-peixe-fator").value = peixe?.fator ?? 1;
  $("#campo-peixe-fixos").value = peixe?.pontosFixos ?? 0;
  alternarCamposPeixe();
  abrir("#modal-peixe");
}

function alternarCamposPeixe() {
  const fixa = $("#campo-peixe-modo").value === "fixa";
  $("#rotulo-peixe-fator").classList.toggle("oculto", fixa);
  $("#rotulo-peixe-fixos").classList.toggle("oculto", !fixa);
}

export function iniciarModalPeixe() {
  $("#campo-peixe-modo").addEventListener("change", alternarCamposPeixe);
  $("#btn-peixe-cancelar").addEventListener("click", () => fechar("#modal-peixe"));
  $("#modal-peixe").addEventListener("click", (e) => {
    if (e.target.id === "modal-peixe") fechar("#modal-peixe");
  });

  $("#form-peixe").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = $("#campo-peixe-nome").value.trim();
    if (!nome) {
      toast("Informe o nome.", "erro");
      return;
    }
    if (!peixeEmEdicao && peixePorNome(nome)) {
      toast("Já existe um peixe com esse nome.", "erro");
      return;
    }

    await salvarPeixe({
      nome,
      modo: $("#campo-peixe-modo").value,
      fator: parseFloat($("#campo-peixe-fator").value) || 0,
      pontosFixos: parseFloat($("#campo-peixe-fixos").value) || 0,
      trofeu: peixeEmEdicao?.trofeu,
      penalidade: peixeEmEdicao?.penalidade,
      padrao: peixeEmEdicao?.padrao,
    });

    peixeEmEdicao = null;
    fechar("#modal-peixe");
    toast("Peixe salvo.");
  });
}

// =========================================================================
//  Boas-vindas — "quem é você?"
// =========================================================================

export function abrirBemVindo() {
  $("#opcoes-eu").innerHTML = estado.pescadores
    .map(
      (n) => `<button type="button" class="opcao-etapa" data-eu="${esc(n)}">
                <span class="opcao-nome">${esc(n)}</span>
              </button>`
    )
    .join("");
  abrir("#modal-bemvindo");
}

export function iniciarBemVindo() {
  $("#modal-bemvindo").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-eu]");
    if (!btn) return;
    definirEu(btn.dataset.eu);
    fechar("#modal-bemvindo");
    toast(`Boa pescaria, ${btn.dataset.eu.split(" ")[0]}! 🎣`);
  });
}

// =========================================================================
//  Foto ampliada
// =========================================================================

// O lightbox cria a PRÓPRIA URL da foto em vez de reaproveitar a do card.
// A do card pertence ao histórico e é revogada no próximo redesenho — com o
// sync rodando a cada 20 s, a foto ampliada virava um quadrado quebrado
// sozinha, sem ninguém encostar na tela.
let urlLightbox = null;

async function abrirLightbox(fotoId) {
  if (!fotoId) return;
  fecharLightbox();

  const url = await urlDaFoto(fotoId);
  if (!url) {
    toast("Essa foto não está mais neste aparelho.", "erro");
    return;
  }

  urlLightbox = url;
  $("#lightbox-img").src = url;
  $("#lightbox").classList.remove("oculto");
}

function fecharLightbox() {
  $("#lightbox").classList.add("oculto");
  $("#lightbox-img").removeAttribute("src");
  if (urlLightbox) {
    URL.revokeObjectURL(urlLightbox);
    urlLightbox = null;
  }
}

// =========================================================================
//  Eventos globais dos modais
// =========================================================================

export function iniciarEventosGlobais() {
  // Escape fecha o que estiver mais acima — a foto ampliada vem antes dos
  // modais, porque é ela que fica por cima quando os dois estão abertos.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    if (!$("#lightbox").classList.contains("oculto")) {
      fecharLightbox();
      return;
    }

    const abertos = $$(".modal:not(.oculto)");
    const ultimo = abertos[abertos.length - 1];
    if (ultimo) fechar(`#${ultimo.id}`);
  });

  // Escolha de etapa.
  $("#opcoes-etapa").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-escolher]");
    if (!btn) return;
    definirEtapaAtual(btn.dataset.escolher);
    fechar("#modal-escolher-etapa");
  });

  // Histórico: editar, remover e ampliar foto.
  $("#historico-lista").addEventListener("click", async (e) => {
    const editar = e.target.closest("[data-editar]");
    if (editar) {
      const pesca = estado.pescas.find((p) => p.id === editar.dataset.editar);
      if (pesca) abrirModalPesca(pesca);
      return;
    }

    const remover = e.target.closest("[data-remover]");
    if (remover) {
      const pesca = estado.pescas.find((p) => p.id === remover.dataset.remover);
      if (!pesca) return;
      if (!confirm(`Remover ${pesca.tipo} de ${pesca.pescador}?`)) return;
      await removerPesca(pesca.id);
      toast("Pesca removida.");
      return;
    }

    const foto = e.target.closest("[data-foto]");
    if (foto) {
      const pesca = estado.pescas.find((p) => p.id === foto.dataset.foto);
      await abrirLightbox(pesca?.fotoId);
    }
  });

  $("#lightbox").addEventListener("click", fecharLightbox);

  // Lista de etapas na aba Geral.
  $("#lista-etapas").addEventListener("click", async (e) => {
    const editar = e.target.closest("[data-editar-etapa]");
    if (editar) {
      const etapa = estado.etapas.find((x) => x.id === editar.dataset.editarEtapa);
      if (etapa) abrirModalEtapa(etapa);
      return;
    }

    const remover = e.target.closest("[data-remover-etapa]");
    if (remover) {
      const etapa = estado.etapas.find((x) => x.id === remover.dataset.removerEtapa);
      if (!etapa) return;
      const qtd = estado.pescas.filter((p) => p.etapaId === etapa.id && !p.removida).length;
      const aviso = qtd
        ? `Remover "${etapa.nome}" e as ${qtd} pescas dela?`
        : `Remover "${etapa.nome}"?`;
      if (!confirm(aviso)) return;
      await removerEtapa(etapa.id);
      toast("Etapa removida.");
      return;
    }

    const item = e.target.closest("[data-etapa]");
    if (item) definirEtapaAtual(item.dataset.etapa);
  });
}
