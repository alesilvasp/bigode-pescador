// =========================================================================
//  Service worker — o que faz o app abrir sem internet.
//
//  Estratégia por tipo de pedido:
//    • Navegação (abrir o app)  → cache primeiro, atualiza por baixo
//    • Arquivos do app (js/css) → cache primeiro, atualiza por baixo
//    • Supabase e outros hosts  → nunca passa por aqui
//
//  Navegação é cache-first de propósito, não rede-first: na beira do rio o
//  sinal costuma existir e não prestar, e rede-first deixaria o app numa tela
//  branca até o fetch estourar. A versão nova chega pelo aviso do próprio
//  service worker. Ver o comentário no handler de `fetch`.
//
//  Ao mexer nos arquivos do app, suba o número da versão abaixo. É isso que
//  faz o celular de cada um pegar a versão nova.
// =========================================================================

const VERSAO = "v2.4.0";
const CACHE = `bigode-pescador-${VERSAO}`;

// Tudo que o app precisa para abrir offline.
const ARQUIVOS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/config.js",
  "./js/db.js",
  "./js/estado.js",
  "./js/pontuacao.js",
  "./js/ui.js",
  "./js/modais.js",
  "./js/ajustes.js",
  "./js/exportar.js",
  "./js/sync.js",
  "./js/pwa.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.svg",
];

// ---- Instalação -----------------------------------------------------------

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll é tudo-ou-nada: um 404 derruba a instalação inteira. Aqui cada
      // arquivo é tentado por conta própria, para um ícone faltando não
      // impedir o app de funcionar offline.
      await Promise.all(
        ARQUIVOS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch((e) => {
            console.warn("[sw] não cacheou", url, e.message);
          })
        )
      );
    })()
  );
});

// ---- Ativação -------------------------------------------------------------

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      // Remove caches de versões antigas.
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((n) => n.startsWith("bigode-pescador-") && n !== CACHE)
          .map((n) => caches.delete(n))
      );

      // Navigation preload fica DESLIGADO de propósito: com a rede fora, o
      // preload falha e o Chrome derruba a navegação antes do fallback de
      // cache rodar — o app não abria offline. Como servimos do cache
      // primeiro, ele também não traria ganho nenhum.

      await self.clients.claim();
    })()
  );
});

// ---- Requisições ----------------------------------------------------------

/**
 * Devolve a resposta sem a marca de "veio de redirect".
 *
 * O Chrome recusa responder uma navegação com resposta redirecionada e a
 * página nem abre. Reconstruir apaga a marca e preserva o conteúdo — melhor
 * que descartar, que deixaria o app sem abrir offline.
 */
async function semRedirect(resp) {
  if (!resp || !resp.redirected) return resp;
  return new Response(await resp.blob(), {
    status: 200,
    statusText: resp.statusText,
    headers: resp.headers,
  });
}

self.addEventListener("fetch", (evento) => {
  const req = evento.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Só cuidamos dos arquivos do próprio app. Supabase e qualquer outro host
  // passam direto — dado de sincronização não pode vir de cache velho.
  if (url.origin !== self.location.origin) return;

  // Abrir o app: responde do cache PRIMEIRO e busca a versão nova por baixo.
  //
  // Rede primeiro seria o instinto, mas está errado aqui: na beira do rio o
  // sinal costuma existir e não prestar, e aí o app ficaria 30 s numa tela
  // branca esperando o fetch estourar. Assim ele abre instantâneo sempre; a
  // atualização chega pelo aviso de "nova versão" do próprio service worker.
  if (req.mode === "navigate") {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);

        // Casa com a RAIZ primeiro, não com "./index.html". Servidor com clean
        // URLs (a Vercel, por `cleanUrls`, e o `serve` do npm run dev) responde
        // 301/308 em /index.html, então o que o install guardou nessa chave é
        // uma resposta marcada como REDIRECIONADA — e devolver isso para uma
        // navegação faz o Chrome derrubar a página. Não aparece nada no log do
        // servidor: só uma tela de erro, como se o app não existisse.
        const cacheado = await semRedirect(
          (await cache.match("./")) || (await cache.match("./index.html"))
        );

        const daRede = fetch(req)
          .then((resp) => {
            if (resp && resp.ok) cache.put("./", resp.clone());
            return resp;
          })
          .catch(() => null);

        if (cacheado) {
          evento.waitUntil(daRede); // atualiza sem segurar a resposta
          return cacheado;
        }

        // Primeira visita, ainda sem cache: só resta a rede.
        return (await daRede) || Response.error();
      })()
    );
    return;
  }

  // Arquivos do app: responde do cache na hora e atualiza em segundo plano.
  evento.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cacheado = await cache.match(req);

      const daRede = fetch(req)
        .then((resp) => {
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        })
        .catch(() => null);

      return cacheado || (await daRede) || Response.error();
    })()
  );
});

// ---- Mensagens ------------------------------------------------------------

self.addEventListener("message", (evento) => {
  // Enviado quando o usuário clica em "atualizar" no aviso de versão nova.
  if (evento.data?.tipo === "ASSUMIR_CONTROLE") {
    self.skipWaiting();
  }
});
