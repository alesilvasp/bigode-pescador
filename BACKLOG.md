# Backlog — Bigode Pescador

Próximos passos do app. Cada item é auto-contido: dá pra pedir ao Claude Code
"faça o item X do BACKLOG.md" que ele tem contexto suficiente. Contexto geral do
projeto (estrutura, fórmula, chaves do localStorage) está no [`CLAUDE.md`](CLAUDE.md).

Ordem sugerida: **1 → 2** primeiro (colocar no ar como PWA), depois o resto conforme a vontade.

---

## 1. Deploy na Vercel  ⭐ prioridade

**Objetivo:** publicar o app numa URL pública (HTTPS), necessário também para o PWA.

**Passos:**
- Projeto é 100% estático (sem build). Na Vercel: **New Project → importar o repo
  `alesilvasp/bigode-pescador`**. Framework preset = **Other**; build command vazio;
  output directory = raiz (`.`).
- Alternativa por CLI: `npm i -g vercel` e rodar `vercel` na raiz do projeto.
- (Opcional) adicionar um `vercel.json` só se precisar de config; para um site
  estático simples **não é necessário**.

**Pronto quando:** o app abre numa URL `*.vercel.app` e cada push na `main` gera
deploy automático.

---

## 2. Transformar em PWA (instalável + offline)

**Objetivo:** poder "instalar" o app no celular e usar offline na beira do rio.
Depende do item 1 (PWA exige HTTPS — a Vercel já entrega).

**Passos:**
- Criar `manifest.webmanifest` com: `name`, `short_name` ("Bigode"),
  `start_url: "/"`, `display: "standalone"`, `background_color` e `theme_color`
  (`#0b2a3a`, o mesmo tom do tema), e `icons` (gerar 192x192 e 512x512 — pode ser
  o emoji 🎣 num fundo azul, ou um ícone próprio).
- Linkar no `<head>` do `index.html`:
  `<link rel="manifest" href="manifest.webmanifest" />`.
- Criar `service-worker.js` que faça **cache dos assets** (`index.html`,
  `styles.css`, `app.js`, ícones) numa estratégia *cache-first* para funcionar
  offline. Versionar o nome do cache pra facilitar invalidação.
- Registrar o SW no fim do `app.js`:
  ```js
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
  ```

**Cuidado:** service worker só funciona em HTTPS ou `localhost` (não abre via
`file://`). Testar com `npx serve .` ou já na URL da Vercel.

**Pronto quando:** o Chrome/Safari mostra "Instalar app" e ele abre offline.

---

## 3. Editar uma pesca já registrada

**Objetivo:** hoje só dá pra **remover** no histórico. Permitir **editar**.

**Passos:**
- No card do histórico (`renderizarHistorico` em `app.js`), adicionar botão "editar".
- Reaproveitar o modal de nova pesca, pré-preenchendo os campos com os dados da
  pesca (inclusive a foto) e, no submit, atualizar o item em vez de dar `push`.
- Sugestão: guardar um `idEmEdicao` no estado; se estiver setado, o submit faz
  `update`; senão, `insert`.

**Pronto quando:** editar altera a pesca e o ranking recalcula na hora.

---

## 4. Exportar / compartilhar resultados

**Objetivo:** fechar o campeonato e compartilhar o placar.

**Ideias (escolher uma pra começar):**
- Botão "compartilhar" usando a **Web Share API** (`navigator.share`) com um
  resumo em texto do ranking.
- Ou exportar o histórico como **CSV/JSON** (download de um Blob).

**Pronto quando:** dá pra sair do campeonato com o resultado salvo/compartilhado.

---

## 5. Migrar fotos para IndexedDB

**Objetivo:** o `localStorage` tem ~5 MB e as fotos (mesmo comprimidas) enchem
rápido. Mover **as imagens** para IndexedDB, mantendo no localStorage só os
metadados da pesca + a chave da foto.

**Passos:**
- Criar uma camada simples de acesso ao IndexedDB (ou usar `idb-keyval`).
- Ao salvar uma pesca com foto, gravar o dataURL/Blob no IndexedDB e guardar só
  o id na pesca. Ao renderizar o histórico, buscar a imagem por id.
- Fazer uma migração leve dos dados antigos, se houver.

**Pronto quando:** dá pra registrar dezenas de pescas com foto sem estourar cota.

---

### Ideias soltas (sem prioridade)
- Data/hora e **local** da pescaria (GPS opcional).
- Filtro do histórico por pescador ou por peixe.
- Configurar os nomes dos pescadores pela interface (hoje é fixo no `app.js`).
- Regras de desempate mais elaboradas no ranking.
