// =========================================================================
//  Tela de Ajustes — pescadores, peixes, calibragem, sync e export.
// =========================================================================

import { AJUSTES_PADRAO, VERSAO_APP } from "./config.js";
import * as db from "./db.js";
import {
  adicionarPesca,
  criarEtapa,
  definirEu,
  definirPescadores,
  estado,
  etapaAtual,
  peixesAtivos,
  removerPeixe,
  salvarAjustes,
  salvarPeixe,
} from "./estado.js";
import { calcularPontuacao, explicarPontuacao, montarRanking } from "./pontuacao.js";
import * as exportar from "./exportar.js";
import * as sync from "./sync.js";
import { $, esc, toast } from "./ui.js";
import { abrirModalPeixe } from "./modais.js";

// ---- Campos em edição ------------------------------------------------------
//
// A tela de Ajustes é redesenhada a CADA mudança de estado — inclusive a que
// vem do sync, que roda sozinho a cada 20 s. Sem esta proteção, quem estivesse
// digitando via o texto sumir na mão: a calibragem voltava para 1 e a URL do
// Supabase esvaziava no meio da colagem, sem aviso nenhum.
//
// Um campo é marcado ao receber a primeira digitação e liberado quando o valor
// é salvo, descartado ou desligado.

const CAMPOS_DIGITAVEIS = ["#ajuste-mult-peso", "#ajuste-mult-tamanho", "#sync-url", "#sync-key"];

function protegerCamposDigitados() {
  CAMPOS_DIGITAVEIS.forEach((sel) =>
    $(sel).addEventListener("input", (e) => {
      e.target.dataset.editando = "sim";
    })
  );
}

/** Escreve no campo, a menos que o usuário tenha mexido nele e não salvo. */
function preencherCampo(seletor, valor) {
  const el = $(seletor);
  if (el.dataset.editando === "sim") return;
  el.value = valor;
}

/** Some com a marca: o valor foi salvo ou descartado, pode voltar a atualizar. */
function liberarCampos(...seletores) {
  seletores.forEach((sel) => delete $(sel).dataset.editando);
}

// ---- Render ----------------------------------------------------------------

export function renderizarAjustes() {
  renderizarPescadores();
  renderizarPeixes();
  renderizarFormula();
  renderizarSync();
  renderizarSobre();
}

function renderizarPescadores() {
  $("#lista-pescadores").innerHTML = estado.pescadores
    .map(
      (nome) => `
      <div class="item-simples">
        <span>${esc(nome)}${nome === estado.eu ? ' <span class="tag tag-atual">você</span>' : ""}</span>
        <button class="link-acao perigo" data-remover-pescador="${esc(nome)}">remover</button>
      </div>`
    )
    .join("");
}

function renderizarPeixes() {
  $("#lista-peixes").innerHTML = peixesAtivos()
    .map((p) => {
      const detalhe =
        p.modo === "fixa"
          ? `<span class="peixe-fixa">${esc(p.pontosFixos)} pts fixos</span>`
          : `<span class="peixe-fator">fator ${esc(p.fator)}</span>`;
      const marca = p.trofeu ? "🏆" : p.penalidade ? "⚠️" : "🐟";
      // Nome científico e comprimento máximo vêm da tabela oficial do Rodrigo e
      // servem para identificar o bicho — é o que a tabela existe para resolver.
      const ficha = [p.cientifico, p.tamanhoMaximo ? `até ${p.tamanhoMaximo} cm` : ""]
        .filter(Boolean)
        .join(" · ");
      return `
        <div class="item-peixe">
          <span class="peixe-icone">${marca}</span>
          <span class="peixe-nome">
            ${esc(p.nome)}
            ${ficha ? `<span class="peixe-ficha">${esc(ficha)}</span>` : ""}
          </span>
          ${detalhe}
          <span class="item-peixe-acoes">
            <button class="link-acao" data-editar-peixe="${esc(p.nome)}">editar</button>
            <button class="link-acao perigo" data-remover-peixe="${esc(p.nome)}">remover</button>
          </span>
        </div>`;
    })
    .join("");
}

function renderizarFormula() {
  preencherCampo("#ajuste-mult-peso", estado.ajustes.multiplicadorPeso);
  preencherCampo("#ajuste-mult-tamanho", estado.ajustes.multiplicadorTamanho);
  atualizarSimulacao();
}

/** Mostra o efeito da calibragem usando o caso que o Rodrigo deu no grupo. */
function atualizarSimulacao() {
  const ajustes = {
    multiplicadorPeso: parseFloat($("#ajuste-mult-peso").value) || 0,
    multiplicadorTamanho: parseFloat($("#ajuste-mult-tamanho").value) || 0,
  };
  const robalo = { nome: "Robalo", fator: 5, modo: "formula" };

  $("#simulacao-resultado").textContent = new Intl.NumberFormat("pt-BR").format(
    calcularPontuacao(robalo, 100, 45, ajustes)
  );
  $("#simulacao-conta").textContent = explicarPontuacao(robalo, 100, 45, ajustes);
}

function renderizarSync() {
  const cfg = sync.lerConfig();
  preencherCampo("#sync-url", cfg?.url ?? "");
  preencherCampo("#sync-key", cfg?.anonKey ?? "");
  $("#bloco-convite").classList.toggle("oculto", !cfg);

  const status = $("#status-sync");
  if (!cfg) {
    status.textContent = "Desligada — os dados ficam só neste aparelho.";
    status.className = "status-linha";
  } else if (sync.situacao.ultimoErro) {
    status.textContent = `Erro: ${sync.situacao.ultimoErro}`;
    status.className = "status-linha erro";
  } else {
    const pend = estado.pendentesSync;
    status.textContent = pend
      ? `${pend} ${pend === 1 ? "registro" : "registros"} na fila para subir.`
      : "Tudo sincronizado.";
    status.className = "status-linha ok";
  }
}

function renderizarSobre() {
  const modo = window.matchMedia("(display-mode: standalone)").matches ? "instalado" : "navegador";
  const total = estado.pescas.filter((p) => !p.removida).length;
  $("#info-sobre").innerHTML =
    `Versão ${esc(VERSAO_APP)} · rodando no ${esc(modo)}<br>` +
    `${total} ${total === 1 ? "pesca guardada" : "pescas guardadas"} neste aparelho`;
}

// ---- Eventos ---------------------------------------------------------------

export function iniciarAjustes() {
  protegerCamposDigitados();

  // ---- Quem sou eu
  $("#ajuste-eu").addEventListener("change", (e) => {
    definirEu(e.target.value || null);
    toast("Pronto.");
  });

  // ---- Pescadores
  $("#btn-add-pescador").addEventListener("click", adicionarPescador);
  $("#novo-pescador").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      adicionarPescador();
    }
  });

  $("#lista-pescadores").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remover-pescador]");
    if (!btn) return;
    const nome = btn.dataset.removerPescador;
    const qtd = estado.pescas.filter((p) => p.pescador === nome && !p.removida).length;
    if (qtd && !confirm(`${nome} tem ${qtd} pescas registradas. Elas continuam salvas, mas ele sai do ranking. Remover?`)) {
      return;
    }
    // `definirPescadores` grava no banco e enfileira para o sync: sem await, a
    // falha virava uma promessa rejeitada silenciosa e a lista mentia.
    await definirPescadores(estado.pescadores.filter((n) => n !== nome));
    if (estado.eu === nome) definirEu(null);
    renderizarPescadores();
    toast("Pescador removido.");
  });

  // ---- Peixes
  $("#btn-novo-peixe").addEventListener("click", () => abrirModalPeixe());

  $("#lista-peixes").addEventListener("click", async (e) => {
    const editar = e.target.closest("[data-editar-peixe]");
    if (editar) {
      const peixe = estado.peixes.find((p) => p.nome === editar.dataset.editarPeixe);
      if (peixe) abrirModalPeixe(peixe);
      return;
    }

    const remover = e.target.closest("[data-remover-peixe]");
    if (remover) {
      const nome = remover.dataset.removerPeixe;
      const qtd = estado.pescas.filter((p) => p.tipo === nome && !p.removida).length;
      const aviso = qtd
        ? `${nome} foi usado em ${qtd} ${qtd === 1 ? "pesca" : "pescas"}. Elas continuam valendo os pontos atuais. Tirar da lista?`
        : `Tirar ${nome} da lista?`;
      if (!confirm(aviso)) return;
      await removerPeixe(nome);
      toast("Peixe removido da lista.");
    }
  });

  // ---- Calibragem
  ["#ajuste-mult-peso", "#ajuste-mult-tamanho"].forEach((sel) =>
    $(sel).addEventListener("input", atualizarSimulacao)
  );

  $("#btn-salvar-formula").addEventListener("click", async () => {
    const mp = parseFloat($("#ajuste-mult-peso").value);
    const mt = parseFloat($("#ajuste-mult-tamanho").value);

    if (Number.isNaN(mp) || Number.isNaN(mt) || mp < 0 || mt < 0) {
      toast("Os multiplicadores precisam ser números positivos.", "erro");
      return;
    }

    const total = estado.pescas.filter((p) => !p.removida).length;
    if (total && !confirm(`Isso recalcula as ${total} pescas já registradas. Confirma?`)) return;

    liberarCampos("#ajuste-mult-peso", "#ajuste-mult-tamanho");
    const mudaram = await salvarAjustes({ multiplicadorPeso: mp, multiplicadorTamanho: mt });
    toast(mudaram ? `${mudaram} ${mudaram === 1 ? "pesca recalculada" : "pescas recalculadas"}.` : "Salvo.");
  });

  $("#btn-restaurar-formula").addEventListener("click", async () => {
    if (!confirm("Voltar para a regra original do Rodrigo e recalcular tudo?")) return;
    liberarCampos("#ajuste-mult-peso", "#ajuste-mult-tamanho");
    $("#ajuste-mult-peso").value = AJUSTES_PADRAO.multiplicadorPeso;
    $("#ajuste-mult-tamanho").value = AJUSTES_PADRAO.multiplicadorTamanho;
    await salvarAjustes({
      multiplicadorPeso: AJUSTES_PADRAO.multiplicadorPeso,
      multiplicadorTamanho: AJUSTES_PADRAO.multiplicadorTamanho,
    });
    toast("Regra original restaurada.");
  });

  // ---- Sincronização
  $("#btn-testar-sync").addEventListener("click", testarSync);
  $("#btn-salvar-sync").addEventListener("click", salvarSync);
  $("#btn-remover-sync").addEventListener("click", () => {
    if (!confirm("Desligar a sincronização? Os dados continuam neste aparelho.")) return;
    liberarCampos("#sync-url", "#sync-key");
    $("#sync-url").value = "";
    $("#sync-key").value = "";
    sync.limparConfig();
    toast("Sincronização desligada.");
  });
  $("#btn-convite").addEventListener("click", copiarConvite);
  $("#btn-sync").addEventListener("click", sincronizarAgora);

  // ---- Exportar / importar
  $("#btn-export-json").addEventListener("click", () => exportarComo("json"));
  $("#btn-export-xml").addEventListener("click", () => exportarComo("xml"));
  $("#btn-export-csv").addEventListener("click", () => exportarComo("csv"));
  $("#btn-importar").addEventListener("click", () => $("#arquivo-import").click());
  $("#arquivo-import").addEventListener("change", importarArquivo);

  // ---- Compartilhar placar
  $("#btn-compartilhar").addEventListener("click", compartilharPlacar);
}

async function adicionarPescador() {
  const campo = $("#novo-pescador");
  const nome = campo.value.trim();
  if (!nome) return;
  if (estado.pescadores.some((n) => n.toLowerCase() === nome.toLowerCase())) {
    toast("Esse pescador já está na lista.", "erro");
    return;
  }
  await definirPescadores([...estado.pescadores, nome]);
  renderizarPescadores();
  campo.value = "";
  toast("Pescador adicionado.");
}

// ---- Sync ------------------------------------------------------------------

async function testarSync() {
  const url = $("#sync-url").value.trim();
  const key = $("#sync-key").value.trim();
  if (!url || !key) {
    toast("Preencha a URL e a chave.", "erro");
    return;
  }

  const anterior = sync.lerConfig();
  sync.salvarConfig(url, key);

  try {
    await sync.testarConexao();
    toast("Conexão funcionando! 👍");
  } catch (e) {
    // Não deixa uma configuração quebrada no lugar da que funcionava.
    if (anterior) sync.salvarConfig(anterior.url, anterior.anonKey);
    else sync.limparConfig();
    toast(`Não conectou: ${e.message}`, "erro");
  }
}

async function salvarSync() {
  const url = $("#sync-url").value.trim();
  const key = $("#sync-key").value.trim();
  if (!url || !key) {
    toast("Preencha a URL e a chave.", "erro");
    return;
  }

  liberarCampos("#sync-url", "#sync-key");
  sync.salvarConfig(url, key);

  try {
    await sync.testarConexao();
  } catch (e) {
    toast(`Salvei, mas a conexão falhou: ${e.message}`, "erro");
    return;
  }

  // Primeira configuração: manda tudo que já existe neste aparelho.
  const r = await sync.reenviarTudo();
  toast(r.ok ? `Sincronizado! ${r.enviados} registros enviados.` : "Salvo, mas o envio falhou.", r.ok ? "ok" : "erro");
}

async function sincronizarAgora() {
  if (!sync.estaConfigurado()) {
    toast("Sincronização desligada. Configure em Ajustes.", "erro");
    return;
  }
  if (!navigator.onLine) {
    toast("Sem internet agora. Os registros sobem quando o sinal voltar.", "erro");
    return;
  }
  const r = await sync.sincronizar();
  if (r.ok) toast(`Pronto — ${r.enviados} enviados, ${r.recebidos} recebidos.`);
  else toast(`Não deu: ${r.erro || r.motivo}`, "erro");
}

/**
 * Gera um link com as credenciais no fragmento (#).
 * O fragmento não vai para o servidor — fica só entre quem manda e quem abre.
 */
function copiarConvite() {
  const cfg = sync.lerConfig();
  if (!cfg) return;

  const dados = btoa(JSON.stringify(cfg));
  const link = `${location.origin}${location.pathname}#acesso=${encodeURIComponent(dados)}`;

  navigator.clipboard
    .writeText(link)
    .then(() => toast("Link copiado — manda no grupo!"))
    .catch(() => prompt("Copie o link:", link));
}

// ---- Exportar --------------------------------------------------------------

async function exportarComo(formato) {
  const escopo = $("#escopo-export").value;
  const incluirFotos = $("#export-fotos").checked;
  const etapa = etapaAtual();

  if (escopo === "etapa" && !etapa) {
    toast("Nenhuma etapa selecionada.", "erro");
    return;
  }

  toast("Preparando o arquivo…");

  try {
    const pacote = await exportar.montarPacote({
      estado,
      escopo,
      etapaId: etapa?.id,
      incluirFotos,
    });

    const base = escopo === "etapa" ? `bigode-${etapa.nome}` : "bigode-pescador";
    const mapa = {
      json: [exportar.paraJson(pacote), "json", "application/json"],
      xml: [exportar.paraXml(pacote), "xml", "application/xml"],
      csv: [exportar.paraCsv(pacote), "csv", "text/csv"],
    };
    const [conteudo, ext, mime] = mapa[formato];

    exportar.baixar(conteudo, exportar.nomeArquivo(base, ext), mime);
    toast(`${formato.toUpperCase()} baixado.`);
  } catch (e) {
    console.error(e);
    toast("Falhou ao exportar.", "erro");
  }
}

async function importarArquivo(e) {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  e.target.value = "";

  const status = $("#status-import");

  try {
    const pacote = await exportar.lerJson(arquivo);
    const qtd = pacote.pescas.length;

    if (!confirm(`Importar ${qtd} ${qtd === 1 ? "pesca" : "pescas"} de ${pacote.etapas.length} ${pacote.etapas.length === 1 ? "etapa" : "etapas"}?\n\nO que já existir com o mesmo id é atualizado.`)) {
      return;
    }

    // Peixes primeiro: as pescas dependem deles para pontuar.
    for (const p of pacote.peixes || []) {
      if (!estado.peixes.some((x) => x.nome === p.nome)) {
        await salvarPeixe({ ...p, padrao: false });
      }
    }

    // Os pescadores do arquivo entram antes das pescas: sem eles no elenco, a
    // pesca importada não aparece em ranking nenhum e some sem explicação.
    const faltando = (pacote.pescadores || []).filter((n) => !estado.pescadores.includes(n));
    if (faltando.length) await definirPescadores([...estado.pescadores, ...faltando]);

    // As etapas mantêm o id do arquivo. Antes um id novo era sorteado a cada
    // importação, então nada nunca "já existia" — importar o mesmo arquivo
    // duas vezes duplicava o campeonato inteiro.
    const mapaEtapas = new Map();
    for (const et of pacote.etapas) {
      const existente = estado.etapas.find((x) => x.id === et.id);
      if (existente) {
        mapaEtapas.set(et.id, et.id);
      } else {
        const nova = await criarEtapa({
          id: et.id,
          nome: et.nome,
          local: et.local,
          data: et.data,
          encerrada: et.encerrada,
          tornarAtual: false,
        });
        mapaEtapas.set(et.id, nova.id);
      }
    }

    let importadas = 0;
    let repetidas = 0;
    for (const p of pacote.pescas) {
      if (estado.pescas.some((x) => x.id === p.id)) {
        repetidas++;
        continue;
      }

      let foto = null;
      if (p.foto) {
        try {
          foto = await db.dataUrlParaBlob(p.foto);
        } catch {
          /* foto corrompida não impede a pesca de entrar */
        }
      }

      await adicionarPesca({
        id: p.id,
        etapaId: mapaEtapas.get(p.etapaId) || estado.etapaAtualId,
        pescador: p.pescador,
        tipo: p.peixe,
        pesoGramas: p.pesoGramas,
        tamanho: p.tamanhoCm,
        foto,
        data: p.data,
      });
      importadas++;
    }

    status.textContent =
      `${importadas} ${importadas === 1 ? "pesca importada" : "pescas importadas"}` +
      (repetidas ? `, ${repetidas} já ${repetidas === 1 ? "estava" : "estavam"} aqui.` : ".");
    status.className = "status-linha ok";
    toast("Importação concluída.");
  } catch (erro) {
    console.error(erro);
    status.textContent = `Falhou: ${erro.message}`;
    status.className = "status-linha erro";
    toast("Não consegui importar esse arquivo.", "erro");
  }
}

// ---- Compartilhar ----------------------------------------------------------

async function compartilharPlacar() {
  const etapa = etapaAtual();
  if (!etapa) {
    toast("Nenhuma etapa selecionada.", "erro");
    return;
  }

  const pescas = estado.pescas.filter((p) => p.etapaId === etapa.id && !p.removida);
  const texto = exportar.placarEmTexto(etapa, montarRanking(pescas, estado.pescadores));
  const r = await exportar.compartilhar(texto);

  const mensagens = {
    compartilhado: "Compartilhado!",
    copiado: "Placar copiado — é só colar no grupo.",
    cancelado: "",
    falhou: "Não consegui compartilhar.",
  };
  if (mensagens[r]) toast(mensagens[r], r === "falhou" ? "erro" : "ok");
}

// ---- Link de convite -------------------------------------------------------

/**
 * Se a URL tiver `#acesso=...`, aplica as credenciais e limpa o endereço.
 * É como os outros três entram sem digitar nada.
 */
export function aplicarConviteDaUrl() {
  const match = location.hash.match(/acesso=([^&]+)/);
  if (!match) return false;

  try {
    const cfg = JSON.parse(atob(decodeURIComponent(match[1])));
    if (!cfg.url || !cfg.anonKey) return false;

    sync.salvarConfig(cfg.url, cfg.anonKey);
    history.replaceState(null, "", location.pathname);
    toast("Sincronização configurada pelo link! 🎣");
    return true;
  } catch {
    return false;
  }
}
