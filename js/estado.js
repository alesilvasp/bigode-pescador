// =========================================================================
//  Estado do app — modelo de dados e operações.
//
//  Toda escrita passa por aqui: grava no IndexedDB, enfileira para sync e
//  avisa a interface. A UI nunca mexe no banco direto.
// =========================================================================

import {
  AJUSTES_PADRAO,
  CHAVES,
  PEIXES_PADRAO,
  PESCADORES_PADRAO,
  novoId,
} from "./config.js";
import * as db from "./db.js";
import { calcularPontuacao, recalcularTodas } from "./pontuacao.js";

// ---- Estado em memória ----------------------------------------------------

export const estado = {
  etapas: [],
  pescas: [],
  peixes: [],
  pescadores: [...PESCADORES_PADRAO],
  ajustes: { ...AJUSTES_PADRAO },
  eu: null, // qual pescador usa este aparelho
  etapaAtualId: null,
  pendentesSync: 0,
  online: navigator.onLine,
};

// ---- Pub/sub simples ------------------------------------------------------

const ouvintes = new Set();

export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export function notificar(motivo = "geral") {
  ouvintes.forEach((fn) => {
    try {
      fn(motivo);
    } catch (e) {
      console.error("[estado] ouvinte falhou:", e);
    }
  });
}

// ---- localStorage para metadados leves ------------------------------------

function lerLocal(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    if (bruto === null) return padrao;
    return JSON.parse(bruto) ?? padrao;
  } catch {
    return padrao;
  }
}

function gravarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch (e) {
    console.warn("[estado] não consegui gravar no localStorage:", e);
  }
}

// ---- Carga inicial --------------------------------------------------------

export async function carregar() {
  estado.ajustes = { ...AJUSTES_PADRAO, ...lerLocal(CHAVES.ajustes, {}) };
  estado.pescadores = lerLocal(CHAVES.pescadores, [...PESCADORES_PADRAO]);
  estado.eu = lerLocal(CHAVES.eu, null);
  estado.etapaAtualId = lerLocal(CHAVES.etapaAtual, null);

  await garantirPeixesPadrao();
  await migrarDaV1();

  estado.etapas = await db.listar(db.STORES.etapas);
  estado.pescas = await db.listar(db.STORES.pescas);
  estado.peixes = await db.listar(db.STORES.peixes);
  estado.pendentesSync = await db.contarPendentes();

  // Precisa existir uma etapa ABERTA para o app ter onde registrar. Só
  // "existir etapa" não basta: a migração da v1 cria uma já encerrada, e o
  // pessoal abriria o app sem lugar para lançar o próximo peixe.
  if (!estado.etapas.filter((e) => !e.removida && !e.encerrada).length) {
    const numero = estado.etapas.filter((e) => !e.removida).length + 1;
    await criarEtapa({ nome: `${numero}ª Etapa`, data: hoje() });
  }

  // A etapa apontada pode ter sido removida ou encerrada em outro aparelho.
  if (!etapaAtual()) {
    const viva = etapasAtivas().find((e) => !e.encerrada) || etapasAtivas()[0];
    estado.etapaAtualId = viva?.id ?? null;
    gravarLocal(CHAVES.etapaAtual, estado.etapaAtualId);
  }

  notificar("carga");
}

/** Semeia os peixes padrão na primeira execução, sem sobrescrever edições. */
async function garantirPeixesPadrao() {
  const existentes = await db.listar(db.STORES.peixes);
  if (existentes.length) return;
  await db.putVarios(
    db.STORES.peixes,
    PEIXES_PADRAO.map((p) => ({ ...p, padrao: true, atualizadaEm: new Date().toISOString() }))
  );
}

/**
 * Migra os dados da v1 (localStorage) para o IndexedDB.
 *
 * Roda uma vez só. As chaves antigas NÃO são apagadas — se algo der errado,
 * os dados originais continuam lá para recuperação manual.
 */
async function migrarDaV1() {
  if (lerLocal(CHAVES.migrado, false)) return;

  const pescasV1 = lerLocal(CHAVES.v1Pescas, []);
  const peixesExtraV1 = lerLocal(CHAVES.v1PeixesExtra, []);

  if (!pescasV1.length && !peixesExtraV1.length) {
    gravarLocal(CHAVES.migrado, true);
    return;
  }

  console.info(`[migração] trazendo ${pescasV1.length} pescas da v1`);

  // Peixes que o usuário tinha cadastrado à mão.
  const jaTem = new Set((await db.listar(db.STORES.peixes)).map((p) => p.nome.toLowerCase()));
  const novosPeixes = peixesExtraV1
    .filter((p) => !jaTem.has(String(p.nome).toLowerCase()))
    .map((p) => ({ ...p, modo: "formula", padrao: false, atualizadaEm: new Date().toISOString() }));
  await db.putVarios(db.STORES.peixes, novosPeixes);

  // Tudo da v1 cai numa etapa própria, para não misturar com as novas.
  const etapa = {
    id: novoId("etp"),
    nome: "Etapa anterior (importada)",
    local: "",
    data: hoje(),
    encerrada: true,
    removida: false,
    criadaEm: new Date().toISOString(),
    atualizadaEm: new Date().toISOString(),
  };
  await db.put(db.STORES.etapas, etapa);

  for (const antiga of pescasV1) {
    let fotoId = null;
    if (antiga.foto) {
      fotoId = novoId("fot");
      try {
        await db.salvarFoto(fotoId, antiga.foto); // v1 guardava dataURL
      } catch (e) {
        console.warn("[migração] foto não migrou:", e);
        fotoId = null;
      }
    }

    await db.put(db.STORES.pescas, {
      id: antiga.id || novoId("psc"),
      etapaId: etapa.id,
      pescador: antiga.pescador,
      tipo: antiga.tipo,
      fator: antiga.fator,
      modo: "formula",
      pesoGramas: antiga.pesoGramas,
      tamanho: antiga.tamanho,
      pontuacao: antiga.pontuacao, // preserva o snapshot original
      fotoId,
      data: antiga.data,
      removida: false,
      criadaEm: antiga.data,
      atualizadaEm: new Date().toISOString(),
    });
  }

  gravarLocal(CHAVES.migrado, true);
  console.info("[migração] concluída — as chaves da v1 foram mantidas por segurança");
}

// ---- Consultas ------------------------------------------------------------

export const etapasAtivas = () =>
  estado.etapas.filter((e) => !e.removida).sort((a, b) => (a.data < b.data ? 1 : -1));

export const etapaAtual = () =>
  estado.etapas.find((e) => e.id === estado.etapaAtualId && !e.removida) || null;

export const pescasAtivas = () => estado.pescas.filter((p) => !p.removida);

export const pescasDaEtapa = (etapaId) => pescasAtivas().filter((p) => p.etapaId === etapaId);

export const peixesAtivos = () =>
  estado.peixes.filter((p) => !p.removido).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

export const peixePorNome = (nome) => estado.peixes.find((p) => p.nome === nome) || null;

export const mapaPeixes = () => new Map(estado.peixes.map((p) => [p.nome, p]));

// ---- Preferências ---------------------------------------------------------

export function definirEu(nome) {
  estado.eu = nome;
  gravarLocal(CHAVES.eu, nome);
  notificar("eu");
}

export function definirEtapaAtual(id) {
  estado.etapaAtualId = id;
  gravarLocal(CHAVES.etapaAtual, id);
  notificar("etapa-atual");
}

export function definirPescadores(lista) {
  estado.pescadores = lista;
  gravarLocal(CHAVES.pescadores, lista);
  notificar("pescadores");
}

// ---- Etapas ---------------------------------------------------------------

export async function criarEtapa({ nome, local = "", data = hoje() }) {
  const etapa = {
    id: novoId("etp"),
    nome: nome?.trim() || "Etapa sem nome",
    local: local.trim(),
    data,
    encerrada: false,
    removida: false,
    criadaEm: new Date().toISOString(),
    atualizadaEm: new Date().toISOString(),
  };
  await db.put(db.STORES.etapas, etapa);
  await db.enfileirar("upsert", "etapa", etapa);
  estado.etapas.push(etapa);
  definirEtapaAtual(etapa.id);
  await atualizarContagemPendentes();
  notificar("etapas");
  return etapa;
}

export async function atualizarEtapa(id, campos) {
  const i = estado.etapas.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const etapa = { ...estado.etapas[i], ...campos, atualizadaEm: new Date().toISOString() };
  await db.put(db.STORES.etapas, etapa);
  await db.enfileirar("upsert", "etapa", etapa);
  estado.etapas[i] = etapa;
  await atualizarContagemPendentes();
  notificar("etapas");
  return etapa;
}

/**
 * Remove a etapa (soft delete) e as pescas dela.
 * Soft delete porque a exclusão precisa se propagar para os outros aparelhos.
 */
export async function removerEtapa(id) {
  await atualizarEtapa(id, { removida: true });

  for (const pesca of estado.pescas.filter((p) => p.etapaId === id && !p.removida)) {
    await removerPesca(pesca.id);
  }

  if (estado.etapaAtualId === id) {
    definirEtapaAtual(etapasAtivas()[0]?.id ?? null);
  }
  notificar("etapas");
}

// ---- Pescas ---------------------------------------------------------------

export async function adicionarPesca({
  etapaId,
  pescador,
  tipo,
  pesoGramas,
  tamanho,
  foto = null,
  data = new Date().toISOString(),
}) {
  const peixe = peixePorNome(tipo);
  let fotoId = null;
  if (foto) {
    fotoId = novoId("fot");
    await db.salvarFoto(fotoId, foto);
  }

  const pesca = {
    id: novoId("psc"),
    etapaId,
    pescador,
    tipo,
    fator: peixe?.fator ?? 0,
    modo: peixe?.modo ?? "formula",
    pesoGramas: Number(pesoGramas) || 0,
    tamanho: Number(tamanho) || 0,
    pontuacao: calcularPontuacao(peixe, pesoGramas, tamanho, estado.ajustes),
    fotoId,
    data,
    removida: false,
    criadaEm: new Date().toISOString(),
    atualizadaEm: new Date().toISOString(),
  };

  await db.put(db.STORES.pescas, pesca);
  await db.enfileirar("upsert", "pesca", pesca);
  estado.pescas.push(pesca);
  await atualizarContagemPendentes();
  notificar("pescas");
  return pesca;
}

export async function atualizarPesca(id, campos) {
  const i = estado.pescas.findIndex((p) => p.id === id);
  if (i < 0) return null;

  const anterior = estado.pescas[i];
  let fotoId = anterior.fotoId;

  // Foto nova substitui a antiga; `foto: null` explicitamente a remove.
  if (campos.foto) {
    if (fotoId) await db.remover(db.STORES.fotos, fotoId);
    fotoId = novoId("fot");
    await db.salvarFoto(fotoId, campos.foto);
  } else if (campos.foto === null && "foto" in campos) {
    if (fotoId) await db.remover(db.STORES.fotos, fotoId);
    fotoId = null;
  }
  delete campos.foto;

  const tipo = campos.tipo ?? anterior.tipo;
  const peixe = peixePorNome(tipo);
  const pesoGramas = campos.pesoGramas ?? anterior.pesoGramas;
  const tamanho = campos.tamanho ?? anterior.tamanho;

  const pesca = {
    ...anterior,
    ...campos,
    fotoId,
    fator: peixe?.fator ?? anterior.fator,
    modo: peixe?.modo ?? anterior.modo,
    pontuacao: calcularPontuacao(peixe, pesoGramas, tamanho, estado.ajustes),
    atualizadaEm: new Date().toISOString(),
  };

  await db.put(db.STORES.pescas, pesca);
  await db.enfileirar("upsert", "pesca", pesca);
  estado.pescas[i] = pesca;
  await atualizarContagemPendentes();
  notificar("pescas");
  return pesca;
}

export async function removerPesca(id) {
  const i = estado.pescas.findIndex((p) => p.id === id);
  if (i < 0) return;

  const pesca = { ...estado.pescas[i], removida: true, atualizadaEm: new Date().toISOString() };
  await db.put(db.STORES.pescas, pesca);
  await db.enfileirar("upsert", "pesca", pesca);
  if (pesca.fotoId) await db.remover(db.STORES.fotos, pesca.fotoId);
  estado.pescas[i] = pesca;
  await atualizarContagemPendentes();
  notificar("pescas");
}

// ---- Peixes ---------------------------------------------------------------

export async function salvarPeixe(peixe) {
  const registro = {
    nome: peixe.nome.trim(),
    fator: Number(peixe.fator) || 0,
    modo: peixe.modo === "fixa" ? "fixa" : "formula",
    pontosFixos: Number(peixe.pontosFixos) || 0,
    trofeu: !!peixe.trofeu,
    penalidade: !!peixe.penalidade,
    padrao: !!peixe.padrao,
    removido: false,
    atualizadaEm: new Date().toISOString(),
  };

  await db.put(db.STORES.peixes, registro);
  await db.enfileirar("upsert", "peixe", registro);

  const i = estado.peixes.findIndex((p) => p.nome === registro.nome);
  if (i >= 0) estado.peixes[i] = registro;
  else estado.peixes.push(registro);

  await atualizarContagemPendentes();
  notificar("peixes");
  return registro;
}

export async function removerPeixe(nome) {
  const i = estado.peixes.findIndex((p) => p.nome === nome);
  if (i < 0) return;
  const registro = { ...estado.peixes[i], removido: true, atualizadaEm: new Date().toISOString() };
  await db.put(db.STORES.peixes, registro);
  await db.enfileirar("upsert", "peixe", registro);
  estado.peixes[i] = registro;
  notificar("peixes");
}

// ---- Ajustes --------------------------------------------------------------

/**
 * Salva os ajustes e recalcula a pontuação de todas as pescas.
 *
 * Diferente da v1, aqui o snapshot NÃO é preservado: se o grupo mudar um fator,
 * o campeonato inteiro é recalculado com a regra nova. É o comportamento que
 * faz sentido para uma tela de calibragem — todo mundo sob a mesma régua.
 */
export async function salvarAjustes(novos) {
  estado.ajustes = { ...estado.ajustes, ...novos };
  gravarLocal(CHAVES.ajustes, estado.ajustes);

  const recalculadas = recalcularTodas(estado.pescas, mapaPeixes(), estado.ajustes);
  const mudaram = recalculadas.filter((p, i) => p !== estado.pescas[i]);

  if (mudaram.length) {
    await db.putVarios(db.STORES.pescas, mudaram);
    for (const p of mudaram) await db.enfileirar("upsert", "pesca", p);
    estado.pescas = recalculadas;
    await atualizarContagemPendentes();
  }

  notificar("ajustes");
  return mudaram.length;
}

// ---- Sync -----------------------------------------------------------------

export async function atualizarContagemPendentes() {
  estado.pendentesSync = await db.contarPendentes();
}

/** Aplica um registro que veio do servidor, sem reenfileirar para sync. */
export async function aplicarRemoto(entidade, registro) {
  const store = { etapa: db.STORES.etapas, pesca: db.STORES.pescas, peixe: db.STORES.peixes }[
    entidade
  ];
  if (!store) return;

  const lista = { etapa: estado.etapas, pesca: estado.pescas, peixe: estado.peixes }[entidade];
  const chave = entidade === "peixe" ? "nome" : "id";
  const i = lista.findIndex((x) => x[chave] === registro[chave]);

  // Last-write-wins: só aceita se for mais recente que o que temos.
  if (i >= 0 && lista[i].atualizadaEm > registro.atualizadaEm) return;

  // As fotos NÃO trafegam pelo servidor — ficam no aparelho de quem tirou.
  // Sem isto, sincronizar apagaria a referência da foto local, porque o
  // registro que volta do banco sempre traz fotoId nulo.
  if (entidade === "pesca" && i >= 0 && lista[i].fotoId && !registro.fotoId) {
    registro = { ...registro, fotoId: lista[i].fotoId };
  }

  // Peixes padrão semeados localmente não devem perder a marca ao voltar
  // do servidor, senão somem da lista de sugestões.
  if (entidade === "peixe" && i >= 0 && lista[i].padrao) {
    registro = { ...registro, padrao: true };
  }

  await db.put(store, registro);
  if (i >= 0) lista[i] = registro;
  else lista.push(registro);

  notificar(entidade === "pesca" ? "pescas" : entidade === "etapa" ? "etapas" : "peixes");
}

// ---- Utilidades -----------------------------------------------------------

export function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Rede: mantém o estado espelhado para a interface mostrar o indicador.
window.addEventListener("online", () => {
  estado.online = true;
  notificar("rede");
});
window.addEventListener("offline", () => {
  estado.online = false;
  notificar("rede");
});
