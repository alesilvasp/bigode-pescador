// =========================================================================
//  Sincronização com o Supabase.
//
//  Objetivo: os 4 verem os mesmos dados sem precisar exportar arquivo.
//
//  Como funciona:
//   1. Toda escrita já foi gravada no IndexedDB e enfileirada no outbox.
//   2. Ao sincronizar, sobe o outbox e baixa o que mudou desde a última vez.
//   3. Conflito resolve por "quem escreveu por último vence" (atualizadaEm).
//
//  Fala com a REST API do Supabase por fetch puro — sem SDK, sem build, sem
//  120 KB de dependência para cachear no service worker. Usa polling em vez
//  de WebSocket de propósito: em rede móvel de beira de rio, reconectar
//  WebSocket é fonte de dor; um GET a cada 20 s é chato e funciona sempre.
//
//  Enquanto não houver credenciais configuradas, tudo aqui fica inerte e o
//  app funciona 100% offline.
// =========================================================================

import { CHAVES } from "./config.js";
import * as db from "./db.js";
import { aplicarRemoto, atualizarContagemPendentes, estado, notificar } from "./estado.js";

const INTERVALO_POLLING = 20_000;
const CHAVE_ULTIMO_SYNC = "bigode-pescador:ultimo-sync";

let timerPolling = null;
let sincronizando = false;

export const situacao = {
  configurado: false,
  ultimoSync: null,
  ultimoErro: null,
  sincronizando: false,
};

// ---- Configuração ---------------------------------------------------------

export function lerConfig() {
  try {
    return JSON.parse(localStorage.getItem(CHAVES.supabase)) || null;
  } catch {
    return null;
  }
}

export function salvarConfig(url, anonKey) {
  const limpo = { url: String(url).trim().replace(/\/+$/, ""), anonKey: String(anonKey).trim() };
  localStorage.setItem(CHAVES.supabase, JSON.stringify(limpo));
  situacao.configurado = true;
  iniciar();
  notificar("sync");
}

export function limparConfig() {
  localStorage.removeItem(CHAVES.supabase);
  situacao.configurado = false;
  parar();
  notificar("sync");
}

export const estaConfigurado = () => !!lerConfig()?.url && !!lerConfig()?.anonKey;

// ---- Chamada REST ---------------------------------------------------------

async function chamar(caminho, opcoes = {}) {
  const cfg = lerConfig();
  if (!cfg) throw new Error("Supabase não configurado");

  const resp = await fetch(`${cfg.url}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      "Content-Type": "application/json",
      ...opcoes.headers,
    },
  });

  if (!resp.ok) {
    const corpo = await resp.text().catch(() => "");
    throw new Error(`Supabase ${resp.status}: ${corpo.slice(0, 200)}`);
  }

  // Respostas sem corpo (ex.: POST com Prefer: return=minimal devolve 201 vazio,
  // ou um 204) não têm JSON para ler. Só faz o parse se veio conteúdo.
  const texto = await resp.text();
  return texto ? JSON.parse(texto) : null;
}

/** Testa as credenciais sem gravar nada. */
export async function testarConexao() {
  await chamar("etapas?select=id&limit=1");
  return true;
}

// ---- Mapeamento entre o formato local e as colunas do banco ---------------
//
// O banco usa snake_case (convenção do Postgres) e o app camelCase.

// Coalesce para não mandar undefined em coluna NOT NULL: o JSON.stringify
// descartaria o campo e o Postgres receberia NULL (erro 23502). Cada valor cai
// no mesmo default declarado no schema.sql.
const agora = () => new Date().toISOString();

const PARA_BANCO = {
  etapa: (e) => ({
    id: e.id,
    nome: e.nome,
    local: e.local ?? "",
    data: e.data,
    encerrada: !!e.encerrada,
    removida: !!e.removida,
    criada_em: e.criadaEm ?? agora(),
    atualizada_em: e.atualizadaEm ?? agora(),
  }),
  pesca: (p) => ({
    id: p.id,
    etapa_id: p.etapaId,
    pescador: p.pescador,
    tipo: p.tipo,
    fator: p.fator ?? 0,
    modo: p.modo ?? "formula",
    peso_gramas: p.pesoGramas ?? 0,
    tamanho: p.tamanho ?? 0,
    pontuacao: p.pontuacao ?? 0,
    data: p.data ?? agora(),
    removida: !!p.removida,
    criada_em: p.criadaEm ?? agora(),
    atualizada_em: p.atualizadaEm ?? agora(),
  }),
  peixe: (p) => ({
    nome: p.nome,
    fator: p.fator ?? 0,
    modo: p.modo ?? "formula",
    pontos_fixos: p.pontosFixos ?? 0,
    trofeu: !!p.trofeu,
    penalidade: !!p.penalidade,
    removido: !!p.removido,
    atualizada_em: p.atualizadaEm ?? agora(),
  }),
};

const DO_BANCO = {
  etapa: (r) => ({
    id: r.id,
    nome: r.nome,
    local: r.local || "",
    data: r.data,
    encerrada: !!r.encerrada,
    removida: !!r.removida,
    criadaEm: r.criada_em,
    atualizadaEm: r.atualizada_em,
  }),
  pesca: (r) => ({
    id: r.id,
    etapaId: r.etapa_id,
    pescador: r.pescador,
    tipo: r.tipo,
    fator: Number(r.fator),
    modo: r.modo,
    pesoGramas: Number(r.peso_gramas),
    tamanho: Number(r.tamanho),
    pontuacao: Number(r.pontuacao),
    fotoId: null, // fotos não sobem: ficam no aparelho de quem tirou
    data: r.data,
    removida: !!r.removida,
    criadaEm: r.criada_em,
    atualizadaEm: r.atualizada_em,
  }),
  peixe: (r) => ({
    nome: r.nome,
    fator: Number(r.fator),
    modo: r.modo,
    pontosFixos: Number(r.pontos_fixos),
    trofeu: !!r.trofeu,
    penalidade: !!r.penalidade,
    removido: !!r.removido,
    padrao: false,
    atualizadaEm: r.atualizada_em,
  }),
};

const TABELA = { etapa: "etapas", pesca: "pescas", peixe: "peixes" };

// ---- Subida (outbox → servidor) -------------------------------------------

async function subirPendentes() {
  const pendentes = await db.listarPendentes();
  if (!pendentes.length) return 0;

  // Agrupa por tabela para mandar em lote.
  const porTabela = new Map();
  for (const item of pendentes) {
    const lista = porTabela.get(item.entidade) || [];
    lista.push(item);
    porTabela.set(item.entidade, lista);
  }

  let enviados = 0;

  for (const [entidade, itens] of porTabela) {
    const tabela = TABELA[entidade];
    if (!tabela) continue;

    // Se a mesma entidade mudou várias vezes, só a última versão importa.
    const chave = entidade === "peixe" ? "nome" : "id";
    const ultimaVersao = new Map();
    itens.forEach((i) => ultimaVersao.set(i.dados[chave], i));

    const corpo = [...ultimaVersao.values()].map((i) => PARA_BANCO[entidade](i.dados));

    // O PostgREST exige que todos os objetos de um insert em lote tenham as
    // MESMAS chaves; como o JSON.stringify descarta campos undefined, linhas
    // diferentes podem sair com conjuntos de chaves distintos (erro PGRST102).
    // Declarar ?columns=... fixa as colunas e usa o default do banco nas que
    // faltarem, em vez de recusar o lote.
    const colunas = [...new Set(corpo.flatMap((o) => Object.keys(o)))].join(",");

    await chamar(`${tabela}?on_conflict=${chave}&columns=${encodeURIComponent(colunas)}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(corpo),
    });

    // Só tira do outbox depois que o servidor aceitou.
    for (const item of itens) await db.removerPendente(item.id);
    enviados += itens.length;
  }

  return enviados;
}

// ---- Descida (servidor → local) -------------------------------------------

async function baixarMudancas() {
  const desde = localStorage.getItem(CHAVE_ULTIMO_SYNC) || "1970-01-01T00:00:00Z";
  let recebidos = 0;

  for (const entidade of ["etapa", "peixe", "pesca"]) {
    const tabela = TABELA[entidade];
    const registros = await chamar(
      `${tabela}?select=*&atualizada_em=gt.${encodeURIComponent(desde)}&order=atualizada_em.asc&limit=1000`
    );

    for (const r of registros || []) {
      await aplicarRemoto(entidade, DO_BANCO[entidade](r));
      recebidos++;
    }
  }

  return recebidos;
}

// ---- Ciclo de sincronização -----------------------------------------------

export async function sincronizar({ silencioso = false } = {}) {
  if (!estaConfigurado()) return { ok: false, motivo: "nao-configurado" };
  if (sincronizando) return { ok: false, motivo: "ja-rodando" };
  if (!navigator.onLine) return { ok: false, motivo: "offline" };

  sincronizando = true;
  situacao.sincronizando = true;
  if (!silencioso) notificar("sync");

  // Marca o instante ANTES de baixar, para não perder escritas concorrentes.
  const carimbo = new Date().toISOString();

  try {
    const enviados = await subirPendentes();
    const recebidos = await baixarMudancas();

    localStorage.setItem(CHAVE_ULTIMO_SYNC, carimbo);
    situacao.ultimoSync = carimbo;
    situacao.ultimoErro = null;
    await atualizarContagemPendentes();

    return { ok: true, enviados, recebidos };
  } catch (e) {
    situacao.ultimoErro = e.message;
    console.warn("[sync] falhou:", e.message);
    return { ok: false, motivo: "erro", erro: e.message };
  } finally {
    sincronizando = false;
    situacao.sincronizando = false;
    notificar("sync");
  }
}

// ---- Ciclo de vida --------------------------------------------------------

export function iniciar() {
  situacao.configurado = estaConfigurado();
  if (!situacao.configurado) return;

  parar();
  sincronizar({ silencioso: true });

  timerPolling = setInterval(() => {
    // Não gasta bateria e dados com o app em segundo plano.
    if (document.visibilityState === "visible" && navigator.onLine) {
      sincronizar({ silencioso: true });
    }
  }, INTERVALO_POLLING);

  // Voltou a rede ou o app voltou ao primeiro plano: sincroniza na hora.
  window.addEventListener("online", aoVoltar);
  document.addEventListener("visibilitychange", aoVoltar);
}

function aoVoltar() {
  if (document.visibilityState === "visible" && navigator.onLine) {
    sincronizar({ silencioso: true });
  }
}

export function parar() {
  if (timerPolling) clearInterval(timerPolling);
  timerPolling = null;
  window.removeEventListener("online", aoVoltar);
  document.removeEventListener("visibilitychange", aoVoltar);
}

/** Reenvia tudo do zero — usado quando o Felipe pluga o Supabase depois. */
export async function reenviarTudo() {
  for (const e of estado.etapas) await db.enfileirar("upsert", "etapa", e);
  for (const p of estado.peixes) await db.enfileirar("upsert", "peixe", p);
  for (const p of estado.pescas) await db.enfileirar("upsert", "pesca", p);
  await atualizarContagemPendentes();
  return sincronizar();
}
