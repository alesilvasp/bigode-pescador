// =========================================================================
//  Interface — renderização das telas.
//
//  Regra da casa: nada de dado do usuário entra em innerHTML sem passar por
//  `esc()`. Nome de peixe e de pescador são digitados à mão; um "<" solto
//  quebraria a tela inteira.
// =========================================================================

import { OPCAO_NOVO } from "./config.js";
import {
  estado,
  etapaAtual,
  etapasAtivas,
  pescasAtivas,
  pescasDaEtapa,
  peixesAtivos,
} from "./estado.js";
import { montarRanking } from "./pontuacao.js";
import { urlDaFoto } from "./db.js";
import { situacao as situacaoSync } from "./sync.js";

// ---- Helpers ---------------------------------------------------------------

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// ---- Modais ----------------------------------------------------------------
// Moram aqui, e não em `modais.js`, porque o `pwa.js` também abre um modal e
// importar `modais.js` de lá fecharia um ciclo entre os dois.

export function abrir(idModal) {
  $(idModal).classList.remove("oculto");
  document.body.classList.add("travado");
}

export function fechar(idModal) {
  $(idModal).classList.add("oculto");
  if (!$$(".modal:not(.oculto)").length) document.body.classList.remove("travado");
}

/** Tem algum modal na frente agora? */
export const temModalAberto = () => $$(".modal:not(.oculto)").length > 0;

/** Escapa HTML. Usado em TODA interpolação de dado do usuário. */
export function esc(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatarPeso(gramas) {
  const g = Number(gramas) || 0;
  return g >= 1000 ? `${(g / 1000).toFixed(2).replace(".", ",")} kg` : `${Math.round(g)} g`;
}

export function formatarNumero(n) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(Number(n) || 0));
}

export function formatarData(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDataCurta(aaaaMmDd) {
  if (!aaaaMmDd) return "";
  const [a, m, d] = String(aaaaMmDd).split("-");
  return `${d}/${m}/${a}`;
}

let timerToast = null;
export function toast(mensagem, tipo = "ok") {
  const el = $("#toast");
  el.textContent = mensagem;
  el.className = `toast ${tipo}`;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.classList.add("oculto"), 3200);
}

/**
 * Aviso que fica na tela até alguém agir — usado pelo "nova versão disponível".
 *
 * Cancela o cronômetro do aviso anterior: sem isso, um toast comum disparado
 * segundos antes escondia o aviso de atualização no meio, e a versão nova
 * ficava esperando sem ninguém saber.
 */
export function avisoComAcao(html) {
  const el = $("#toast");
  clearTimeout(timerToast);
  el.className = "toast acao";
  el.innerHTML = html;
  el.classList.remove("oculto");
  return el;
}

// URLs de foto criadas com createObjectURL; revogadas ao re-renderizar.
let urlsAtivas = [];
function revogarUrls() {
  urlsAtivas.forEach((u) => URL.revokeObjectURL(u));
  urlsAtivas = [];
}

// Conta as renderizações do histórico para descartar as que ficaram para trás.
// Ler foto do IndexedDB é assíncrono, então duas renderizações podem estar no
// ar ao mesmo tempo — e com o sync a cada 20 s isso acontece de verdade.
let geracaoHistorico = 0;

// ---- Abas ------------------------------------------------------------------

export function iniciarAbas() {
  $$(".aba").forEach((aba) => {
    aba.addEventListener("click", () => trocarAba(aba.dataset.aba));
  });
}

export function trocarAba(alvo) {
  $$(".aba").forEach((a) => {
    const ativa = a.dataset.aba === alvo;
    a.classList.toggle("ativa", ativa);
    a.setAttribute("aria-selected", String(ativa));
  });
  ["campeonato", "historico", "geral", "ajustes"].forEach((nome) => {
    $(`#aba-${nome}`).classList.toggle("oculto", nome !== alvo);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---- Cabeçalho -------------------------------------------------------------

export function renderizarCabecalho() {
  const etapa = etapaAtual();
  $("#etapa-nome").textContent = etapa
    ? `${etapa.nome}${etapa.encerrada ? " (encerrada)" : ""}`
    : "Nenhuma etapa";

  renderizarChipSync();
}

function renderizarChipSync() {
  const chip = $("#btn-sync");
  const texto = $("#texto-sync");
  const pendentes = estado.pendentesSync;

  chip.classList.remove("sync-ok", "sync-pendente", "sync-erro", "sync-off");

  if (!situacaoSync.configurado) {
    chip.classList.add("sync-off");
    texto.textContent = "só neste aparelho";
    chip.title = "Sincronização desligada — configure em Ajustes";
  } else if (!estado.online) {
    chip.classList.add("sync-pendente");
    texto.textContent = pendentes ? `${pendentes} na fila` : "sem rede";
    chip.title = "Sem internet. Os registros sobem quando o sinal voltar.";
  } else if (situacaoSync.sincronizando) {
    chip.classList.add("sync-pendente");
    texto.textContent = "sincronizando…";
  } else if (situacaoSync.ultimoErro) {
    chip.classList.add("sync-erro");
    texto.textContent = "erro";
    chip.title = situacaoSync.ultimoErro;
  } else if (pendentes) {
    chip.classList.add("sync-pendente");
    texto.textContent = `${pendentes} na fila`;
  } else {
    chip.classList.add("sync-ok");
    texto.textContent = "sincronizado";
    chip.title = situacaoSync.ultimoSync
      ? `Última sincronização: ${formatarData(situacaoSync.ultimoSync)}`
      : "Sincronizado";
  }
}

// ---- Aba Campeonato --------------------------------------------------------

export function renderizarRanking() {
  const etapa = etapaAtual();
  const corpo = $("#ranking-corpo");
  const pescas = etapa ? pescasDaEtapa(etapa.id) : [];
  const ranking = montarRanking(pescas, estado.pescadores);
  const medalhas = ["🥇", "🥈", "🥉"];

  corpo.innerHTML = ranking
    .map((s, i) => {
      const tem = s.qtd > 0;
      const medalha = tem && i < 3 ? medalhas[i] : "";
      const classes = [tem && i === 0 ? "lider" : "", s.nome === estado.eu ? "sou-eu" : ""]
        .filter(Boolean)
        .join(" ");
      return `
        <tr class="${classes}">
          <td class="numero"><span class="medalha">${medalha}</span>${i + 1}</td>
          <td class="nome-pescador">${esc(s.nome)}</td>
          <td class="numero">${s.qtd}</td>
          <td class="numero">${s.maior ? `${s.maior.toFixed(1).replace(".", ",")}` : "—"}</td>
          <td class="numero">${tem ? formatarPeso(s.pesoTotal) : "—"}</td>
          <td class="numero ${s.pontos < 0 ? "pontos negativo" : "pontos"}">${formatarNumero(s.pontos)}</td>
        </tr>`;
    })
    .join("");

  renderizarDestaque(ranking, pescas);
}

function renderizarDestaque(ranking, pescas) {
  const box = $("#destaque-lider");
  const lider = ranking[0];

  if (!lider || lider.qtd === 0) {
    box.classList.add("oculto");
    return;
  }

  const maior = pescas.reduce(
    (m, p) => (!m || p.pontuacao > m.pontuacao ? p : m),
    null
  );

  box.classList.remove("oculto");
  box.innerHTML = `
    <div class="destaque-titulo">🥇 Liderando</div>
    <div class="destaque-nome">${esc(lider.nome)}</div>
    <div class="destaque-pontos">${formatarNumero(lider.pontos)} <span>pontos</span></div>
    ${
      maior
        ? `<div class="destaque-rodape">Maior pontuação da etapa: <strong>${esc(maior.tipo)}</strong>
             de ${esc(maior.pescador)} — ${formatarNumero(maior.pontuacao)} pts</div>`
        : ""
    }`;
}

// ---- Aba Histórico ---------------------------------------------------------

export async function renderizarHistorico() {
  const minhaGeracao = ++geracaoHistorico;

  const etapa = etapaAtual();
  const filtro = $("#filtro-pescador").value;
  const lista = $("#historico-lista");
  const vazio = $("#vazio-historico");

  let pescas = etapa ? pescasDaEtapa(etapa.id) : [];
  if (filtro) pescas = pescas.filter((p) => p.pescador === filtro);
  pescas = [...pescas].sort((a, b) => (a.data < b.data ? 1 : -1));

  $("#contador-pescas").textContent = `${pescas.length} ${pescas.length === 1 ? "pesca" : "pescas"}`;
  vazio.classList.toggle("oculto", pescas.length > 0);

  lista.innerHTML = pescas
    .map((p) => {
      const cls = p.pontuacao < 0 ? "card-pontos negativo" : "card-pontos";
      const medida =
        p.modo === "fixa"
          ? "pontuação fixa"
          : `${String(p.tamanho).replace(".", ",")} cm · ${formatarPeso(p.pesoGramas)}`;
      return `
        <div class="card" data-pesca="${esc(p.id)}">
          <div class="card-foto placeholder" data-slot-foto="${esc(p.id)}">🐟</div>
          <div class="card-info">
            <div class="card-titulo">${esc(p.tipo)}</div>
            <div class="card-sub">${esc(p.pescador)} · ${esc(medida)}</div>
            <div class="card-data">${esc(formatarData(p.data))}</div>
          </div>
          <div class="card-lado">
            <div class="${cls}">${formatarNumero(p.pontuacao)}</div>
            <div class="card-botoes">
              <button class="link-acao" data-editar="${esc(p.id)}" aria-label="Editar">editar</button>
              <button class="link-acao perigo" data-remover="${esc(p.id)}" aria-label="Remover">remover</button>
            </div>
          </div>
        </div>`;
    })
    .join("");

  // Só agora as <img> da renderização anterior saíram do DOM — revogar antes
  // disso deixava a tela cheia de foto quebrada quando duas renderizações se
  // cruzavam (o sync dispara uma a cada 20 s).
  revogarUrls();

  // Fotos entram depois, de forma assíncrona, para a lista aparecer na hora.
  for (const p of pescas) {
    if (!p.fotoId) continue;
    const url = await urlDaFoto(p.fotoId);

    // Outra renderização começou enquanto líamos esta foto: a lista no DOM já
    // é de outra geração. Desiste, senão colaríamos a imagem numa tela velha
    // e vazaríamos a URL.
    if (minhaGeracao !== geracaoHistorico) {
      if (url) URL.revokeObjectURL(url);
      return;
    }

    if (!url) continue;
    urlsAtivas.push(url);
    const slot = lista.querySelector(`[data-slot-foto="${CSS.escape(p.id)}"]`);
    if (slot) {
      slot.outerHTML = `<img class="card-foto" src="${url}" alt="Foto do peixe" data-foto="${esc(p.id)}" loading="lazy" />`;
    }
  }
}

// ---- Aba Geral -------------------------------------------------------------

export function renderizarGeral() {
  const todas = pescasAtivas();
  const etapas = etapasAtivas();

  // Ranking acumulado.
  const ranking = montarRanking(todas, estado.pescadores);
  const etapasPorPescador = new Map(
    estado.pescadores.map((nome) => [
      nome,
      new Set(todas.filter((p) => p.pescador === nome).map((p) => p.etapaId)).size,
    ])
  );
  const medalhas = ["🥇", "🥈", "🥉"];

  $("#geral-corpo").innerHTML = ranking
    .map((s, i) => {
      const tem = s.qtd > 0;
      const classes = [tem && i === 0 ? "lider" : "", s.nome === estado.eu ? "sou-eu" : ""]
        .filter(Boolean)
        .join(" ");
      return `
        <tr class="${classes}">
          <td class="numero"><span class="medalha">${tem && i < 3 ? medalhas[i] : ""}</span>${i + 1}</td>
          <td class="nome-pescador">${esc(s.nome)}</td>
          <td class="numero">${etapasPorPescador.get(s.nome) || 0}</td>
          <td class="numero">${s.qtd}</td>
          <td class="numero ${s.pontos < 0 ? "pontos negativo" : "pontos"}">${formatarNumero(s.pontos)}</td>
        </tr>`;
    })
    .join("");

  // Lista de etapas com o campeão de cada uma.
  $("#lista-etapas").innerHTML = etapas
    .map((e) => {
      const pescas = todas.filter((p) => p.etapaId === e.id);
      const campeao = montarRanking(pescas, estado.pescadores)[0];
      const atual = e.id === estado.etapaAtualId;
      return `
        <div class="item-etapa ${atual ? "atual" : ""}" data-etapa="${esc(e.id)}">
          <div class="item-etapa-info">
            <div class="item-etapa-nome">
              ${esc(e.nome)}
              ${e.encerrada ? '<span class="tag">encerrada</span>' : ""}
              ${atual ? '<span class="tag tag-atual">atual</span>' : ""}
            </div>
            <div class="item-etapa-sub">
              ${esc(formatarDataCurta(e.data))}${e.local ? ` · ${esc(e.local)}` : ""} ·
              ${pescas.length} ${pescas.length === 1 ? "pesca" : "pescas"}
              ${campeao && campeao.qtd ? ` · 🥇 ${esc(campeao.nome)}` : ""}
            </div>
          </div>
          <div class="item-etapa-acoes">
            <button class="link-acao" data-editar-etapa="${esc(e.id)}">editar</button>
            <button class="link-acao perigo" data-remover-etapa="${esc(e.id)}">remover</button>
          </div>
        </div>`;
    })
    .join("");

  renderizarRecordes(todas);
}

function renderizarRecordes(todas) {
  const box = $("#recordes");

  if (!todas.length) {
    box.innerHTML = '<p class="vazio">Ainda sem pescas registradas.</p>';
    return;
  }

  const maiorPontuacao = todas.reduce((m, p) => (p.pontuacao > m.pontuacao ? p : m));
  const maiorPeixe = todas.reduce((m, p) => (p.tamanho > m.tamanho ? p : m));
  const maisPesado = todas.reduce((m, p) => (p.pesoGramas > m.pesoGramas ? p : m));

  // Espécie mais pescada.
  const contagem = new Map();
  todas.forEach((p) => contagem.set(p.tipo, (contagem.get(p.tipo) || 0) + 1));
  const [especieTop, qtdTop] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];

  const cartoes = [
    ["🏅", "Maior pontuação", `${formatarNumero(maiorPontuacao.pontuacao)} pts`, `${maiorPontuacao.tipo} · ${maiorPontuacao.pescador}`],
    ["📏", "Maior peixe", `${String(maiorPeixe.tamanho).replace(".", ",")} cm`, `${maiorPeixe.tipo} · ${maiorPeixe.pescador}`],
    ["⚖️", "Mais pesado", formatarPeso(maisPesado.pesoGramas), `${maisPesado.tipo} · ${maisPesado.pescador}`],
    ["🐟", "Mais pescado", especieTop, `${qtdTop} ${qtdTop === 1 ? "vez" : "vezes"}`],
  ];

  box.innerHTML = cartoes
    .map(
      ([icone, titulo, valor, sub]) => `
      <div class="recorde">
        <div class="recorde-icone">${icone}</div>
        <div class="recorde-titulo">${esc(titulo)}</div>
        <div class="recorde-valor">${esc(valor)}</div>
        <div class="recorde-sub">${esc(sub)}</div>
      </div>`
    )
    .join("");
}

// ---- Selects reutilizados --------------------------------------------------

export function preencherSelectPescadores() {
  const opcoes = estado.pescadores.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");

  const filtro = $("#filtro-pescador");
  const anterior = filtro.value;
  filtro.innerHTML = `<option value="">Todos os pescadores</option>${opcoes}`;
  filtro.value = estado.pescadores.includes(anterior) ? anterior : "";

  $("#campo-pescador").innerHTML = opcoes;
  $("#ajuste-eu").innerHTML = `<option value="">— não escolhido —</option>${opcoes}`;
  $("#ajuste-eu").value = estado.eu || "";
}

export function preencherSelectPeixes(valorSelecionado) {
  const select = $("#campo-tipo");

  // Quantas vezes cada peixe já foi registrado — o mais pescado sobe.
  // Numa pescaria o pessoal repete as mesmas espécies; deixar Robalo no topo
  // depois do terceiro robalo economiza rolagem com a mão molhada.
  const usos = new Map();
  pescasAtivas().forEach((p) => usos.set(p.tipo, (usos.get(p.tipo) || 0) + 1));

  const ordenar = (a, b) =>
    (usos.get(b.nome) || 0) - (usos.get(a.nome) || 0) ||
    a.nome.localeCompare(b.nome, "pt-BR");

  const opcao = (p) => {
    const detalhe = p.modo === "fixa" ? `${p.pontosFixos} pts fixos` : `fator ${p.fator}`;
    const marca = p.trofeu ? "🏆 " : p.penalidade ? "⚠️ " : "";
    return `<option value="${esc(p.nome)}">${marca}${esc(p.nome)} (${esc(detalhe)})</option>`;
  };

  const todos = peixesAtivos();
  const porFormula = todos.filter((p) => p.modo !== "fixa").sort(ordenar);
  const porFixa = todos.filter((p) => p.modo === "fixa").sort(ordenar);

  // Os de fórmula vêm primeiro: são o caso comum, e mantêm peso e tamanho
  // visíveis ao abrir o formulário.
  select.innerHTML =
    (porFormula.length
      ? `<optgroup label="Pela fórmula">${porFormula.map(opcao).join("")}</optgroup>`
      : "") +
    (porFixa.length
      ? `<optgroup label="Pontuação fixa">${porFixa.map(opcao).join("")}</optgroup>`
      : "") +
    `<option value="${OPCAO_NOVO}">➕ Cadastrar novo peixe…</option>`;

  if (valorSelecionado) select.value = valorSelecionado;
}

// ---- Renderização geral ----------------------------------------------------

export function renderizarTudo() {
  renderizarCabecalho();
  renderizarRanking();
  renderizarHistorico();
  renderizarGeral();
}
