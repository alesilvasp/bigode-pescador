// =========================================================================
//  Bigode Pescador — lógica do app
//  Vanilla JS, sem build. Dados persistidos em localStorage.
// =========================================================================

// ---- Configuração --------------------------------------------------------

// Pescadores fixos do campeonato.
const PESCADORES = ["Luis Fellipe", "Felipe Felix", "Rodrigo Massi", "Alex Sakaki"];

// Peixes padrão: nome + fator de pontuação.
// Peixe Galo é troféu (fator alto); Baiacu é penalidade (fator negativo).
const PEIXES_PADRAO = [
  { nome: "Robalo", fator: 5 },
  { nome: "Caranha", fator: 5 },
  { nome: "Traíra", fator: 5 },
  { nome: "Corvina", fator: 4 },
  { nome: "Pescada", fator: 4 },
  { nome: "Bagre", fator: 3 },
  { nome: "Peixe Galo", fator: 10 },
  { nome: "Baiacu", fator: -0.5 },
];

const OPCAO_NOVO = "__novo__"; // valor especial no select de peixe

// Chaves do localStorage.
const CHAVE_PESCAS = "bigode-pescador:pescas";
const CHAVE_PEIXES_EXTRA = "bigode-pescador:peixes-extra";

// ---- Estado --------------------------------------------------------------

let pescas = ler(CHAVE_PESCAS, []);          // pescas registradas
let peixesExtra = ler(CHAVE_PEIXES_EXTRA, []); // peixes cadastrados pelo usuário
let unidadePeso = "kg";                        // "kg" | "g"
let fotoAtual = null;                          // dataURL da foto em edição

function listaPeixes() {
  return [...PEIXES_PADRAO, ...peixesExtra];
}

// ---- Pontuação -----------------------------------------------------------

// Regra oficial: pontuação = fator × peso(gramas) + fator × tamanho(cm).
function calcularPontuacao(fator, pesoGramas, tamanhoCm) {
  return Math.round(fator * pesoGramas + fator * tamanhoCm);
}

// ---- Persistência --------------------------------------------------------

function ler(chave, padrao) {
  try {
    const valor = JSON.parse(localStorage.getItem(chave));
    return valor ?? padrao;
  } catch {
    return padrao;
  }
}

function salvar() {
  localStorage.setItem(CHAVE_PESCAS, JSON.stringify(pescas));
  localStorage.setItem(CHAVE_PEIXES_EXTRA, JSON.stringify(peixesExtra));
}

// ---- Utilidades ----------------------------------------------------------

// Reduz a imagem (canvas) e devolve um dataURL JPEG leve para caber no localStorage.
function comprimirImagem(file, maxLado = 1024, qualidade = 0.7) {
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
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatarData(iso) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// Mostra o peso guardado (em gramas) de forma amigável.
function formatarPeso(gramas) {
  return gramas >= 1000 ? `${(gramas / 1000).toFixed(2)} kg` : `${Math.round(gramas)} g`;
}

// ---- Renderização: Campeonato -------------------------------------------

function renderizarRanking() {
  const corpo = document.getElementById("ranking-corpo");

  const stats = PESCADORES.map((nome) => {
    const minhas = pescas.filter((p) => p.pescador === nome);
    return {
      nome,
      qtd: minhas.length,
      maior: minhas.reduce((m, p) => Math.max(m, p.tamanho), 0),
      pesoTotal: minhas.reduce((s, p) => s + p.pesoGramas, 0),
      pontos: minhas.reduce((s, p) => s + p.pontuacao, 0),
    };
  });

  // Ordena por pontos (desc), desempate por peso total.
  stats.sort((a, b) => b.pontos - a.pontos || b.pesoTotal - a.pesoTotal);

  const medalhas = ["🥇", "🥈", "🥉"];

  corpo.innerHTML = stats
    .map((s, i) => {
      const temPescas = s.qtd > 0;
      const medalha = temPescas && i < 3 ? medalhas[i] : "";
      const lider = temPescas && i === 0 ? "lider" : "";
      const classePontos = s.pontos < 0 ? "pontos negativo" : "pontos";
      return `
        <tr class="${lider}">
          <td class="numero"><span class="medalha">${medalha}</span> ${i + 1}</td>
          <td>${s.nome}</td>
          <td class="numero">${s.qtd}</td>
          <td class="numero">${s.maior ? s.maior.toFixed(1) : "—"}</td>
          <td class="numero">${formatarPeso(s.pesoTotal)}</td>
          <td class="numero ${classePontos}">${s.pontos}</td>
        </tr>`;
    })
    .join("");
}

// ---- Renderização: Histórico --------------------------------------------

function renderizarHistorico() {
  const lista = document.getElementById("historico-lista");
  const vazio = document.getElementById("vazio-historico");
  const contador = document.getElementById("contador-pescas");

  contador.textContent = `${pescas.length} ${pescas.length === 1 ? "pesca" : "pescas"}`;
  vazio.style.display = pescas.length ? "none" : "block";

  lista.innerHTML = [...pescas]
    .reverse()
    .map((p) => {
      const foto = p.foto
        ? `<img class="card-foto" src="${p.foto}" alt="Foto do peixe" data-foto="${p.id}" />`
        : `<div class="card-foto placeholder">🐟</div>`;
      const classePontos = p.pontuacao < 0 ? "card-pontos negativo" : "card-pontos";
      return `
        <div class="card">
          ${foto}
          <div class="card-info">
            <div class="card-titulo">${p.tipo}</div>
            <div class="card-sub">${p.pescador} · ${p.tamanho.toFixed(1)} cm · ${formatarPeso(p.pesoGramas)}</div>
            <div class="card-data">${formatarData(p.data)}</div>
          </div>
          <div class="card-lado">
            <div class="${classePontos}">${p.pontuacao}</div>
            <button class="btn-remover-foto" data-remover="${p.id}" style="position:static;margin-top:6px">remover</button>
          </div>
        </div>`;
    })
    .join("");
}

function renderizar() {
  renderizarRanking();
  renderizarHistorico();
}

// ---- Abas ----------------------------------------------------------------

document.querySelectorAll(".aba").forEach((aba) => {
  aba.addEventListener("click", () => {
    document.querySelectorAll(".aba").forEach((a) => a.classList.remove("ativa"));
    aba.classList.add("ativa");
    const alvo = aba.dataset.aba;
    document.getElementById("aba-campeonato").classList.toggle("oculto", alvo !== "campeonato");
    document.getElementById("aba-historico").classList.toggle("oculto", alvo !== "historico");
  });
});

// ---- Modal ---------------------------------------------------------------

const modal = document.getElementById("modal");
const form = document.getElementById("form-pesca");
const campoPescador = document.getElementById("campo-pescador");
const campoTipo = document.getElementById("campo-tipo");
const blocoNovo = document.getElementById("bloco-novo-peixe");
const campoNovoNome = document.getElementById("campo-novo-nome");
const campoNovoFator = document.getElementById("campo-novo-fator");
const campoPeso = document.getElementById("campo-peso");
const campoTamanho = document.getElementById("campo-tamanho");
const valorTamanho = document.getElementById("valor-tamanho");
const campoFoto = document.getElementById("campo-foto");
const fotoPreview = document.getElementById("foto-preview");
const fotoPreviewImg = document.getElementById("foto-preview-img");
const previewPontuacao = document.getElementById("preview-pontuacao");

function preencherSelects() {
  campoPescador.innerHTML = PESCADORES.map((n) => `<option>${n}</option>`).join("");
  const opcoes = listaPeixes()
    .map((p) => `<option value="${p.nome}">${p.nome} (fator ${p.fator})</option>`)
    .join("");
  campoTipo.innerHTML = opcoes + `<option value="${OPCAO_NOVO}">➕ Cadastrar novo peixe…</option>`;
}

function abrirModal() {
  form.reset();
  unidadePeso = "kg";
  fotoAtual = null;
  fotoPreview.classList.add("oculto");
  blocoNovo.classList.add("oculto");
  document.querySelectorAll(".toggle-unidade .un").forEach((b) =>
    b.classList.toggle("ativa", b.dataset.un === "kg")
  );
  campoTamanho.value = 30;
  valorTamanho.textContent = "30 cm";
  atualizarPreview();
  modal.classList.remove("oculto");
}

function fecharModal() {
  modal.classList.add("oculto");
}

// Fator do peixe atualmente selecionado (ou do novo peixe sendo cadastrado).
function fatorAtual() {
  if (campoTipo.value === OPCAO_NOVO) return parseFloat(campoNovoFator.value) || 0;
  const peixe = listaPeixes().find((p) => p.nome === campoTipo.value);
  return peixe ? peixe.fator : 0;
}

function pesoEmGramas() {
  const valor = parseFloat(campoPeso.value) || 0;
  return unidadePeso === "kg" ? valor * 1000 : valor;
}

function atualizarPreview() {
  const tamanho = parseFloat(campoTamanho.value) || 0;
  previewPontuacao.textContent = calcularPontuacao(fatorAtual(), pesoEmGramas(), tamanho);
}

// ---- Eventos do formulário ----------------------------------------------

document.getElementById("btn-adicionar").addEventListener("click", abrirModal);
document.getElementById("btn-cancelar").addEventListener("click", fecharModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) fecharModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("oculto")) fecharModal();
});

// Mostra/esconde o bloco de cadastro de peixe novo.
campoTipo.addEventListener("change", () => {
  blocoNovo.classList.toggle("oculto", campoTipo.value !== OPCAO_NOVO);
  atualizarPreview();
});

// Toggle de unidade de peso (kg / g).
document.querySelectorAll(".toggle-unidade .un").forEach((btn) => {
  btn.addEventListener("click", () => {
    unidadePeso = btn.dataset.un;
    document.querySelectorAll(".toggle-unidade .un").forEach((b) =>
      b.classList.toggle("ativa", b === btn)
    );
    atualizarPreview();
  });
});

// Slider de tamanho.
campoTamanho.addEventListener("input", () => {
  valorTamanho.textContent = `${parseFloat(campoTamanho.value).toFixed(1)} cm`;
  atualizarPreview();
});

[campoPeso, campoNovoFator].forEach((el) => el.addEventListener("input", atualizarPreview));

// Foto: comprime e guarda como dataURL.
campoFoto.addEventListener("change", async () => {
  const file = campoFoto.files[0];
  if (!file) return;
  try {
    fotoAtual = await comprimirImagem(file);
    fotoPreviewImg.src = fotoAtual;
    fotoPreview.classList.remove("oculto");
  } catch {
    alert("Não foi possível carregar essa imagem.");
  }
});

document.getElementById("btn-remover-foto").addEventListener("click", () => {
  fotoAtual = null;
  campoFoto.value = "";
  fotoPreview.classList.add("oculto");
});

form.addEventListener("submit", (e) => {
  e.preventDefault();

  // Se for um peixe novo, valida e cadastra na lista.
  let tipoNome = campoTipo.value;
  if (tipoNome === OPCAO_NOVO) {
    const nome = campoNovoNome.value.trim();
    const fator = parseFloat(campoNovoFator.value);
    if (!nome || Number.isNaN(fator)) {
      alert("Informe o nome e o fator do novo peixe.");
      return;
    }
    if (!listaPeixes().some((p) => p.nome.toLowerCase() === nome.toLowerCase())) {
      peixesExtra.push({ nome, fator });
    }
    tipoNome = nome;
  }

  const tamanho = parseFloat(campoTamanho.value);
  const pesoGramas = pesoEmGramas();

  pescas.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    pescador: campoPescador.value,
    tipo: tipoNome,
    fator: fatorAtual(),
    pesoGramas,
    tamanho,
    pontuacao: calcularPontuacao(fatorAtual(), pesoGramas, tamanho),
    foto: fotoAtual,
    data: new Date().toISOString(),
  });

  salvar();
  preencherSelects(); // caso um peixe novo tenha entrado na lista
  renderizar();
  fecharModal();
});

// ---- Eventos do histórico (remover / ampliar foto) ----------------------

document.getElementById("historico-lista").addEventListener("click", (e) => {
  const remover = e.target.closest("[data-remover]");
  if (remover) {
    pescas = pescas.filter((p) => p.id !== remover.dataset.remover);
    salvar();
    renderizar();
    return;
  }
  const foto = e.target.closest("[data-foto]");
  if (foto) {
    document.getElementById("lightbox-img").src = foto.src;
    document.getElementById("lightbox").classList.remove("oculto");
  }
});

document.getElementById("lightbox").addEventListener("click", () => {
  document.getElementById("lightbox").classList.add("oculto");
});

// ---- Inicialização -------------------------------------------------------

preencherSelects();
renderizar();
