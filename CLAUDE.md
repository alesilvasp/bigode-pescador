# Bigode Pescador

App web do campeonato de pesca entre amigos. **HTML + CSS + JavaScript puro**,
com módulos ES nativos — sem build, sem bundler, sem dependência em produção.

## Como rodar

```bash
npm run dev     # http://localhost:5000
npm test        # testes da regra de pontuação (node --test)
```

> ⚠️ **Não abra o `index.html` por duplo clique.** Módulos ES e service worker
> exigem `http://` ou `https://`. Em `file://` o app não sobe.

## Estrutura

```
index.html    telas, modais, cabeçalho do PWA
styles.css    tema escuro; variáveis em :root; safe areas de iOS
js/           lógica, em módulos ES
supabase/     schema.sql do banco
tests/        testes da pontuação
```

### Os módulos

| Arquivo | Responsabilidade |
|---|---|
| `app.js` | ponto de entrada; ordem de boot |
| `config.js` | peixes padrão, pescadores, chaves do storage |
| `pontuacao.js` | **a regra do campeonato** e o ranking |
| `db.js` | IndexedDB: pescas, etapas, peixes, fotos, fila de sync |
| `estado.js` | modelo em memória + operações; única porta de escrita |
| `ui.js` | renderização das telas |
| `modais.js` | formulários (pesca, etapa, peixe, boas-vindas) |
| `ajustes.js` | tela de ajustes, export/import, convite |
| `sync.js` | sincronização com o Supabase |
| `pwa.js` | service worker, instalação, atalhos |

**Fluxo de escrita:** a UI nunca toca no banco. Tudo passa por `estado.js`, que
grava no IndexedDB, enfileira para sync e avisa a interface pelo `aoMudar()`.

## Regras do domínio

### Pontuação — definida pelo Rodrigo no grupo, não pelo código

```
pontuação = fator × peso(gramas) + fator × tamanho(cm)
```

Caso âncora, que está em `tests/pontuacao.test.js`:
**Robalo (fator 5), 100 g, 45 cm = 725 pontos.** Se esse teste quebrar, a regra
do campeonato mudou — confirme com o Rodrigo antes de ajustar o teste.

**Cada fator tem fonte registrada em comentário no `config.js`** — a fala do
Rodrigo ou do Alex que o originou. Não altere sem falar com o Rodrigo; ele é a
autoridade sobre pontuação. A **Corvina** é a única sem confirmação dele (ver
`BACKLOG.md`).

Dois modos de peixe:
- `formula` — a conta acima.
- `fixa` — vale `pontosFixos`, ignorando peso e tamanho. Ao escolher um desses,
  os campos de peso e tamanho somem do formulário. **Nenhum peixe padrão usa
  este modo**; ele existe para o grupo cadastrar um assim pela tela de Ajustes.

Os multiplicadores em `ajustes` existem só para calibragem pela interface. Ambos
em `1` = regra original intacta.

> ⚠️ Mudar fator ou multiplicador **recalcula todas as pescas já registradas**.
> É intencional: campeonato inteiro sob a mesma régua. Difere da v1, que
> congelava a pontuação no momento do registro.

### Modelo de dados

- **Etapa** — uma pescaria. Tem ranking próprio; a aba Geral soma todas.
- **Pesca** — pertence a uma etapa. Guarda `fator` e `modo` como snapshot.
- **Peixe** — a chave é o `nome`.
- **Pescador** — a chave é o `nome`; `{ nome, removido, atualizadaEm }`. A UI usa
  `estado.pescadores` como lista de nomes ativos, derivada do store `pescadores`
  (IndexedDB v2). `definirPescadores()` faz o diff e grava um registro por
  mudança; por isso é `async`.
- Exclusão é **soft delete** (`removida`/`removido: true`), para a exclusão se
  propagar no sync. Nada é apagado de verdade.

### Sincronização

Offline-first: grava local, enfileira no `outbox`, sobe quando há rede. Conflito
resolve por `atualizadaEm` (quem escreveu por último vence). Polling a cada 20 s
com o app em primeiro plano — **não** WebSocket, de propósito: reconexão de
WebSocket em rede móvel ruim é fonte de dor.

O `outbox` só recebe itens se houver Supabase configurado; quem liga depois usa
`sync.reenviarTudo()`, que a tela de Ajustes chama ao salvar as credenciais.

**As fotos não sobem.** Ficam no aparelho de quem tirou — economiza cota e não
faz falta para o ranking. Por isso `aplicarRemoto()` preserva o `fotoId` local
quando o registro volta do servidor.

> ⚠️ **Ao adicionar/alterar tabela no banco, re-rode o `supabase/schema.sql`** no
> SQL Editor (é idempotente). A tabela `pescadores` foi adicionada depois do
> setup inicial — quem provisionou antes precisa rodar de novo, senão o sync de
> pescadores dá 404 na tabela.

## Convenções

- Nomes, comentários e mensagens em **português**.
- **Todo dado do usuário passa por `esc()` antes de ir para `innerHTML`.** Nome
  de peixe e de pescador são digitados à mão; há teste cobrindo isso.
- CSS com variáveis em `:root`, sem cor hardcoded.
- Fonte de 16px nos inputs — abaixo disso o iOS dá zoom sozinho ao focar.
- Ao mexer nos arquivos do app, **suba `VERSAO` no `service-worker.js`** e a
  lista `ARQUIVOS` se criar arquivo novo. É o que faz a atualização chegar nos
  celulares.

## Armadilhas já resolvidas (não reintroduzir)

1. **`navigationPreload` desligado.** Com ele, o Chrome derruba a navegação
   quando a rede cai e o app não abre offline.
2. **Navegação é cache-first**, não network-first: com sinal fraco, network-first
   deixaria o app numa tela branca até o fetch estourar.
3. **`controllerchange` só recarrega se já havia controller.** Na primeira
   visita o `clients.claim()` também dispara o evento, e o app piscava à toa.
4. **Convite também escuta `hashchange`.** Clicar no link com o app já aberto só
   troca o fragmento; sem isso, o convite passava batido.
5. **A migração da v1 cria uma etapa aberta.** A etapa importada nasce encerrada;
   sem a nova, o app abriria sem lugar para registrar.
6. **`chamar()` trata resposta sem corpo.** Um POST com `Prefer: return=minimal`
   volta **201 vazio** (não 204); ler `resp.json()` direto dá "Unexpected end of
   JSON input". Faz `resp.text()` e só parseia se veio conteúdo.
7. **Insert em lote não emite `undefined`.** O PostgREST exige as mesmas chaves em
   todos os objetos do lote, e o `JSON.stringify` descarta campos `undefined` —
   linhas com chaves diferentes davam **PGRST102**. Além do `?columns=`, os
   mapeadores em `PARA_BANCO` coalescem cada campo no default do schema, senão
   uma coluna `NOT NULL` (ex.: `pontos_fixos`) recebe NULL e dá **23502**.
8. **O script de teste passa o DIRETÓRIO, nunca um glob.** `node --test tests/*.test.js`
   funciona no Linux e no Node 22+, mas quebra no Windows: o npm roda os scripts
   pelo `cmd.exe`, que não expande glob, e o Node 20 não interpreta o padrão
   sozinho. Pior, ele **sai com código 0** — o teste não roda e ninguém percebe.
   `node --test tests/` funciona em todo SO e versão, e sai 1 quando falha.
9. **A etapa inicial é criada DEPOIS do primeiro sync.** `garantirEtapaAberta()`
   roda no boot só depois de um `sincronizar()` aguardado (ver `app.js`). Se cada
   aparelho criasse a "1ª Etapa" no `carregar()`, com id próprio, PC e celular
   ficavam com duas etapas iguais e a pesca de um sumia no outro. Por isso
   `sincronizar()` **aguarda a sync em andamento** em vez de sair com "ja-rodando":
   o `await` do boot precisa esperar o download de verdade.

## Estado do roadmap

Feito: Vercel-ready, PWA completo, etapas, edição, IndexedDB, export JSON/XML/CSV,
tela de ajustes, sincronização.

**No ar desde 11/08/2026:** https://bigode-pescador.vercel.app — Vercel com
auto-deploy, Supabase provisionado e sync validado ponta a ponta em produção.
Detalhes e o que sobrou estão em [`BACKLOG.md`](BACKLOG.md).

> A Vercel e o Supabase estão na conta do **Alex**. A Vercel exige ser *dono* do
> repositório para importar um projeto — colaborador não consegue, e isso não é
> limitação de plano.
