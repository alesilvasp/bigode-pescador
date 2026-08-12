// =========================================================================
//  Estado do app — modelo de dados e operações.
//
//  Toda escrita passa por aqui: grava no IndexedDB, enfileira para sync e
//  avisa a interface. A UI nunca mexe no banco direto.
// =========================================================================

import {
  AJUSTES_PADRAO,
  CHAVES,
  ESCALA_ANTIGA,
  PEIXES_PADRAO,
  PESCADORES_PADRAO,
  novoId,
} from "./config.js";
import * as db from "./db.js";
import { calcularPontuacao, migrarPeixeDeEscala, recalcularTodas } from "./pontuacao.js";

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

let profundidadeLote = 0;
let motivosPendentes = new Set();

/** Assina as mudanças. O callback recebe um **Set** de motivos. */
export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export function notificar(motivo = "geral") {
  if (profundidadeLote > 0) {
    motivosPendentes.add(motivo);
    return;
  }
  emitir(new Set([motivo]));
}

function emitir(motivos) {
  ouvintes.forEach((fn) => {
    try {
      fn(motivos);
    } catch (e) {
      console.error("[estado] ouvinte falhou:", e);
    }
  });
}

/**
 * Junta todas as notificações de `fn` numa só, emitida no fim.
 *
 * É o que impede o sync de congelar o celular: `aplicarRemoto()` roda uma vez
 * por registro baixado e cada uma disparava um redesenho COMPLETO de quatro
 * telas (ranking, histórico, geral e ajustes) — 100 registros viravam 400
 * redesenhos, cada um refazendo listas inteiras por `innerHTML` e relendo as
 * fotos do IndexedDB. Agora é um redesenho por sincronização.
 *
 * Reentrante: chamadas aninhadas só emitem quando a mais externa termina.
 */
export async function emLote(fn) {
  profundidadeLote++;
  try {
    return await fn();
  } finally {
    profundidadeLote--;
    if (profundidadeLote === 0 && motivosPendentes.size) {
      const motivos = motivosPendentes;
      motivosPendentes = new Set();
      emitir(motivos);
    }
  }
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
  estado.eu = lerLocal(CHAVES.eu, null);
  estado.etapaAtualId = lerLocal(CHAVES.etapaAtual, null);

  await garantirPeixesPadrao();
  await migrarEscalaDePontos();
  await garantirPescadores();
  await migrarDaV1();

  estado.etapas = await db.listar(db.STORES.etapas);
  estado.pescas = await db.listar(db.STORES.pescas);
  estado.peixes = await db.listar(db.STORES.peixes);
  estado.pescadores = await pescadoresAtivos();
  estado.pendentesSync = await db.contarPendentes();

  notificar("carga");
}

/**
 * Garante que exista uma etapa ABERTA para registrar, e aponta a atual.
 *
 * É chamada pelo app.js **depois da primeira sincronização**: assim, se outro
 * aparelho já criou a "1ª Etapa", este usa a que veio do servidor em vez de
 * criar uma duplicada. Criar aqui, antes do sync, era a causa das etapas
 * repetidas entre celular e PC.
 */
export async function garantirEtapaAberta() {
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
}

// Carimbo dos registros semeados. Precisa ser BEM antigo: assim, qualquer edição
// real (feita por alguém, com data atual) vence o padrão no last-write-wins. Se
// fosse `agora`, um aparelho que semeia depois "ganharia" de uma remoção que veio
// do servidor com data anterior — e o registro apagado ressuscitaria.
const CARIMBO_SEED = "1970-01-01T00:00:00.000Z";

/**
 * Semeia os peixes padrão, sem sobrescrever edição nenhuma.
 *
 * Semeia por AUSÊNCIA de nome, não pelo store estar vazio. Antes era `if
 * (existentes.length) return`, e com isso espécie nova no `config.js` nunca
 * chegava a quem já tinha o app: a lista oficial do Rodrigo saltou de 8 para 34
 * peixes e todos os aparelhos em uso ficariam com os 8 antigos para sempre.
 *
 * Peixe que alguém REMOVEU continua no store com `removido: true`, então cai no
 * `has()` e não é recriado — a remoção é respeitada.
 *
 * Carimbo antigo de propósito (ver `CARIMBO_SEED`), e sem enfileirar para sync:
 * cada aparelho semeia o seu ao atualizar o app.
 */
async function garantirPeixesPadrao() {
  const existentes = await db.listar(db.STORES.peixes);
  const jaTem = new Map(existentes.map((p) => [p.nome, p]));

  const faltando = PEIXES_PADRAO.filter((p) => !jaTem.has(p.nome)).map((p) => ({
    ...p,
    padrao: true,
    atualizadaEm: CARIMBO_SEED,
  }));

  // Completa nome científico e comprimento máximo nos peixes que já estavam
  // aqui. Sem isto, só as espécies NOVAS teriam os dados da tabela e justamente
  // os mais usados ficariam sem: o Robalo continuaria com régua de 100 cm em
  // vez de 120, num aparelho que usa o app desde antes.
  //
  // Só preenche o que está vazio, e não toca em `fator`, `modo` nem `removido`
  // — aquilo é decisão do grupo, isto é dado de catálogo. `atualizadaEm` também
  // fica como está, para não parecer escrita nova no last-write-wins do sync.
  const completar = [];
  for (const padrao of PEIXES_PADRAO) {
    const atual = jaTem.get(padrao.nome);
    if (!atual || (atual.cientifico && atual.tamanhoMaximo)) continue;
    completar.push({
      ...atual,
      cientifico: atual.cientifico || padrao.cientifico,
      tamanhoMaximo: atual.tamanhoMaximo || padrao.tamanhoMaximo,
    });
  }

  if (faltando.length) await db.putVarios(db.STORES.peixes, faltando);
  if (completar.length) await db.putVarios(db.STORES.peixes, completar);
}

/**
 * Migra a escala de pontos das espécies (12/08/2026).
 *
 * A regra virou `pontos da espécie + comprimento + peso÷100`, e com ela os
 * valores saíram das unidades (5, 4, 2) para as centenas (300, 200, 100). O
 * problema é o BANCO: ele guarda os números antigos, e registro do servidor
 * vence padrão semeado localmente. Sem esta migração, o sync devolveria
 * `fator: 5` para o Robalo e um peixe de 1,5 kg valeria `5 + 51 + 15 = 71`
 * pontos em vez de 366 — placar errado para o grupo inteiro, sem erro na tela.
 *
 * Por isso aqui o carimbo é NOVO (ao contrário de `CARIMBO_SEED`) e a mudança
 * é **enfileirada**: o primeiro aparelho que abrir a versão nova corrige o
 * banco, e os outros baixam já certo. Não precisa de SQL.
 *
 * Só troca quem está EXATAMENTE no valor antigo. Fator que o grupo ajustou na
 * tela é decisão deles e fica de pé. Roda uma vez por aparelho: sem a marca, um
 * valor que o grupo voltasse a 5 de propósito seria reescrito a cada abertura.
 */
async function migrarEscalaDePontos() {
  if (lerLocal(CHAVES.escalaPontos, false)) return;

  const padraoPorNome = new Map(PEIXES_PADRAO.map((p) => [p.nome, p]));
  const mudados = [];

  for (const peixe of await db.listar(db.STORES.peixes)) {
    const troca = migrarPeixeDeEscala(peixe, padraoPorNome.get(peixe.nome), ESCALA_ANTIGA);
    if (!troca) continue;
    mudados.push({ ...peixe, ...troca, atualizadaEm: new Date().toISOString() });
  }

  if (mudados.length) {
    console.info(`[migração] escala de pontos: ${mudados.length} espécies atualizadas`);
    await db.putVarios(db.STORES.peixes, mudados);
    for (const p of mudados) await db.enfileirar("upsert", "peixe", p);
  }

  // Cada pesca guarda a pontuação como SNAPSHOT. Sem recalcular aqui, o placar
  // continuaria exibindo os números da fórmula antiga — a etapa do 1º semestre
  // mostraria 12.795 pontos para quem, na regra nova, fez 2.112. Recalcular no
  // boot é o mesmo que a tela de Ajustes já faz ao mexer na calibragem:
  // campeonato inteiro sob a mesma régua.
  const mapaPeixesAgora = new Map((await db.listar(db.STORES.peixes)).map((p) => [p.nome, p]));
  const pescas = await db.listar(db.STORES.pescas);
  const recalculadas = recalcularTodas(pescas, mapaPeixesAgora, estado.ajustes);
  const pescasMudadas = recalculadas.filter((p, i) => p !== pescas[i]);

  if (pescasMudadas.length) {
    console.info(`[migração] ${pescasMudadas.length} pescas recalculadas pela regra nova`);
    await db.putVarios(db.STORES.pescas, pescasMudadas);
    for (const p of pescasMudadas) await db.enfileirar("upsert", "pesca", p);
  }

  gravarLocal(CHAVES.escalaPontos, true);
}

/**
 * Semeia os pescadores no store na primeira execução, migrando a lista que já
 * existia no localStorage — assim os que o usuário tinha adicionado não se
 * perdem e passam a fazer parte do que é sincronizado.
 */
async function garantirPescadores() {
  const existentes = await db.listar(db.STORES.pescadores);
  if (existentes.length) return;
  const nomes = lerLocal(CHAVES.pescadores, [...PESCADORES_PADRAO]);
  await db.putVarios(
    db.STORES.pescadores,
    nomes.map((nome) => ({ nome, removido: false, atualizadaEm: CARIMBO_SEED }))
  );
}

/**
 * Nomes dos pescadores ativos (não removidos), lidos do store.
 *
 * Ordena com as regras do português: o IndexedDB devolve por ordem de código
 * do caractere, que joga qualquer nome acentuado para depois do "Z".
 */
async function pescadoresAtivos() {
  const regs = await db.listar(db.STORES.pescadores);
  return regs
    .filter((p) => !p.removido)
    .map((p) => p.nome)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
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

export async function definirPescadores(lista) {
  const antes = new Set(estado.pescadores);
  const depois = new Set(lista);

  // Atualiza estado e UI na hora; a persistência e o sync rodam logo abaixo.
  estado.pescadores = [...lista];
  gravarLocal(CHAVES.pescadores, estado.pescadores);
  notificar("pescadores");

  // Cada mudança vira um registro no store, com soft-delete, para sincronizar
  // igual aos peixes: quem entrou vira removido=false; quem saiu, removido=true.
  const agora = new Date().toISOString();
  for (const nome of depois) if (!antes.has(nome)) await gravarPescador(nome, false, agora);
  for (const nome of antes) if (!depois.has(nome)) await gravarPescador(nome, true, agora);

  await atualizarContagemPendentes();
  notificar("pescadores");
}

async function gravarPescador(nome, removido, atualizadaEm) {
  const registro = { nome, removido, atualizadaEm };
  await db.put(db.STORES.pescadores, registro);
  await db.enfileirar("upsert", "pescador", registro);
}

// ---- Etapas ---------------------------------------------------------------

/**
 * Cria uma etapa.
 *
 * `id` e `tornarAtual` existem para a importação: ela precisa manter o id do
 * arquivo (senão reimportar o mesmo export duplica tudo) e não pode ficar
 * trocando a etapa atual a cada etapa lida.
 */
export async function criarEtapa({
  id = null,
  nome,
  local = "",
  data = hoje(),
  encerrada = false,
  tornarAtual = true,
}) {
  const etapa = {
    id: id || novoId("etp"),
    nome: nome?.trim() || "Etapa sem nome",
    local: local.trim(),
    data,
    encerrada: !!encerrada,
    removida: false,
    criadaEm: new Date().toISOString(),
    atualizadaEm: new Date().toISOString(),
  };
  await db.put(db.STORES.etapas, etapa);
  await db.enfileirar("upsert", "etapa", etapa);
  estado.etapas.push(etapa);
  if (tornarAtual) definirEtapaAtual(etapa.id);
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
  await emLote(async () => {
    await atualizarEtapa(id, { removida: true });

    for (const pesca of estado.pescas.filter((p) => p.etapaId === id && !p.removida)) {
      await removerPesca(pesca.id);
    }

    // Só mexe na etapa da tela se foi ELA que saiu — remover uma etapa antiga
    // não pode tirar ninguém de onde estava.
    //
    // Quando é a atual que sai, `garantirEtapaAberta()` reaponta para outra e,
    // se não sobrou nenhuma, cria uma. Antes o app ficava sem lugar para lançar
    // peixe: o "+" só respondia "crie uma etapa antes" até alguém recarregar a
    // página, que era a única hora em que essa função rodava.
    if (estado.etapaAtualId === id || !etapaAtual()) {
      await garantirEtapaAberta();
    }
  });
  notificar("etapas");
}

// ---- Pescas ---------------------------------------------------------------

export async function adicionarPesca({
  id = null, // usado só pela importação, para preservar o id do arquivo
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
    id: id || novoId("psc"),
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
  // Nome científico e comprimento máximo vêm da tabela oficial e não têm campo
  // no formulário: sem preservar aqui, editar o fator de uma espécie apagaria
  // os dois e a régua do slider voltaria ao limite genérico.
  const anterior = peixePorNome(peixe.nome?.trim());

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

  const cientifico = peixe.cientifico ?? anterior?.cientifico;
  const tamanhoMaximo = peixe.tamanhoMaximo ?? anterior?.tamanhoMaximo;
  if (cientifico) registro.cientifico = cientifico;
  if (tamanhoMaximo) registro.tamanhoMaximo = tamanhoMaximo;

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
  // Faltava: sem isto o chip do cabeçalho continuava dizendo "sincronizado"
  // com a remoção ainda parada na fila.
  await atualizarContagemPendentes();
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
  if (entidade === "pescador") return aplicarPescadorRemoto(registro);

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
  //
  // Mesmo motivo vale para nome científico e comprimento máximo: eles não têm
  // coluna no banco (isso exigiria SQL, que só o Alex roda), então o registro
  // que volta do servidor vem sempre sem os dois. Sem preservar, a primeira
  // sincronização apagaria a tabela oficial de todos os aparelhos.
  if (entidade === "peixe" && i >= 0) {
    const local = lista[i];
    registro = {
      ...registro,
      ...(local.padrao ? { padrao: true } : {}),
      ...(local.cientifico ? { cientifico: local.cientifico } : {}),
      ...(local.tamanhoMaximo ? { tamanhoMaximo: local.tamanhoMaximo } : {}),
    };
  }

  await db.put(store, registro);
  if (i >= 0) lista[i] = registro;
  else lista.push(registro);

  notificar(entidade === "pesca" ? "pescas" : entidade === "etapa" ? "etapas" : "peixes");
}

/** Pescador vindo do servidor: aplica com last-write-wins e refaz a lista ativa. */
async function aplicarPescadorRemoto(registro) {
  const local = await db.obter(db.STORES.pescadores, registro.nome);
  if (local && local.atualizadaEm > registro.atualizadaEm) return;
  await db.put(db.STORES.pescadores, registro);
  estado.pescadores = await pescadoresAtivos();
  gravarLocal(CHAVES.pescadores, estado.pescadores);
  notificar("pescadores");
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
