// =========================================================================
//  Persistência local — IndexedDB.
//
//  Substitui o localStorage da v1, que tinha ~5 MB e estourava com poucas
//  fotos. Aqui as fotos ficam num store próprio, guardadas como Blob, e a
//  pesca carrega apenas o id da foto.
//
//  Tudo é offline-first: grava aqui primeiro e sincroniza depois. O app é
//  usado na beira do rio, onde o sinal cai.
// =========================================================================

const NOME_BANCO = "bigode-pescador";
const VERSAO_BANCO = 2;

export const STORES = {
  etapas: "etapas",
  pescas: "pescas",
  peixes: "peixes",
  pescadores: "pescadores",
  fotos: "fotos",
  outbox: "outbox", // fila de operações pendentes de sync
};

let bancoPromise = null;

/** Abre (e cria, se preciso) o banco. Reaproveita a mesma conexão. */
export function abrirBanco() {
  if (bancoPromise) return bancoPromise;

  bancoPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME_BANCO, VERSAO_BANCO);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORES.etapas)) {
        db.createObjectStore(STORES.etapas, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.pescas)) {
        const s = db.createObjectStore(STORES.pescas, { keyPath: "id" });
        s.createIndex("etapaId", "etapaId", { unique: false });
        s.createIndex("pescador", "pescador", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.peixes)) {
        db.createObjectStore(STORES.peixes, { keyPath: "nome" });
      }
      if (!db.objectStoreNames.contains(STORES.pescadores)) {
        db.createObjectStore(STORES.pescadores, { keyPath: "nome" });
      }
      if (!db.objectStoreNames.contains(STORES.fotos)) {
        db.createObjectStore(STORES.fotos, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        db.createObjectStore(STORES.outbox, { keyPath: "id", autoIncrement: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return bancoPromise;
}

// ---- Operações genéricas --------------------------------------------------

async function transacao(store, modo, operacao) {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const req = operacao(tx.objectStore(store));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    if (req) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      tx.oncomplete = () => resolve();
    }
  });
}

export const put = (store, valor) => transacao(store, "readwrite", (s) => s.put(valor));
export const obter = (store, chave) => transacao(store, "readonly", (s) => s.get(chave));
export const remover = (store, chave) => transacao(store, "readwrite", (s) => s.delete(chave));
export const listar = (store) => transacao(store, "readonly", (s) => s.getAll());
export const limpar = (store) => transacao(store, "readwrite", (s) => s.clear());

/** Grava vários registros numa única transação. */
export async function putVarios(store, valores) {
  if (!valores.length) return;
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);
    valores.forEach((v) => objectStore.put(v));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---- Fotos ----------------------------------------------------------------

/**
 * Guarda uma foto e devolve o id. Aceita Blob ou dataURL (a v1 salvava dataURL).
 */
export async function salvarFoto(id, dado) {
  const blob = typeof dado === "string" ? await dataUrlParaBlob(dado) : dado;
  await put(STORES.fotos, { id, blob, criadaEm: new Date().toISOString() });
  return id;
}

/** Devolve uma URL utilizável em <img src>. Lembrar de revogar depois. */
export async function urlDaFoto(id) {
  if (!id) return null;
  const registro = await obter(STORES.fotos, id);
  if (!registro?.blob) return null;
  return URL.createObjectURL(registro.blob);
}

/** Devolve a foto como dataURL — usado na exportação. */
export async function fotoComoDataUrl(id) {
  if (!id) return null;
  const registro = await obter(STORES.fotos, id);
  if (!registro?.blob) return null;
  return blobParaDataUrl(registro.blob);
}

export function blobParaDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlParaBlob(dataUrl) {
  const resp = await fetch(dataUrl);
  return resp.blob();
}

// ---- Fila de sincronização (outbox) ---------------------------------------

/**
 * Registra uma operação para subir quando houver rede.
 *
 * Sem sincronização configurada não enfileira nada: a fila só cresceria para
 * sempre num aparelho que nunca vai sincronizar. Quem ligar o Supabase depois
 * não perde nada — `sync.reenviarTudo()` refaz a fila a partir do que já está
 * gravado, e é isso que a tela de Ajustes chama ao salvar as credenciais.
 *
 * Lê o localStorage direto em vez de importar sync.js, que importa este módulo.
 *
 * @param {"upsert"|"delete"} acao
 * @param {"etapa"|"pesca"|"peixe"|"pescador"} entidade
 */
export async function enfileirar(acao, entidade, dados) {
  if (!syncConfigurado()) return;

  await put(STORES.outbox, {
    acao,
    entidade,
    dados,
    criadaEm: new Date().toISOString(),
  });
}

function syncConfigurado() {
  try {
    const cfg = JSON.parse(localStorage.getItem("bigode-pescador:supabase"));
    return !!cfg?.url && !!cfg?.anonKey;
  } catch {
    return false;
  }
}

export const listarPendentes = () => listar(STORES.outbox);
export const removerPendente = (id) => remover(STORES.outbox, id);

/** Quantas operações estão esperando rede. */
export async function contarPendentes() {
  const itens = await listarPendentes();
  return itens.length;
}

// ---- Espaço em disco ------------------------------------------------------

/** Estimativa de uso, para avisar antes de encher. */
export async function estimarEspaco() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usado: usage, total: quota, percentual: quota ? (usage / quota) * 100 : 0 };
}
