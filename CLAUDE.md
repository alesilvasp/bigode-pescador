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
| `pontuacao.js` | **a regra do campeonato**, o ranking e os títulos |
| `db.js` | IndexedDB: pescas, etapas, peixes, fotos, fila de sync |
| `estado.js` | modelo em memória + operações; única porta de escrita |
| `ui.js` | renderização das telas; também abre e fecha modais |
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

#### A tabela oficial das espécies (Rodrigo, 12/08/2026)

Ele mandou no grupo uma tabela com **32 espécies**, cada uma com nome
científico, comprimento máximo e uma **faixa de valor por cor**. A tabela **não
traz número de fator** — traz faixa. O mapa usado é o que reproduz os quatro
fatores que ele já havia dado:

| Faixa (cor na tabela) | Fator | Confere com |
|---|:--:|---|
| Alto Valor Esportivo (azul-marinho) | 5 | Robalo, Caranha, Traíra |
| Médio Valor (azul) | 4 | Corvina |
| Bagres e Menor Valor (cinza) | 2 | Bagre |
| Penalidade (vermelho) | −0,5 | Baiacu |

Duas exceções propositais, porque **fala dele vence cor**: a **Pescada** segue
**5** (*"mesmo peso de caranha e pescada e robalo"*) embora a tabela a pinte como
Médio Valor, e o **Peixe Galo** segue **10** (o "super trunfo"), que não tem
faixa correspondente. As duas estão no `BACKLOG.md` esperando confirmação.

A lista foi de 8 para **34**: as 32 da tabela, mais "Robalo" e "Bagre"
genéricos. Os genéricos ficam porque **a chave do peixe é o nome** e as pescas
já registradas usam esses nomes — renomear deixaria o histórico órfão. O "GALO"
da tabela é o "Peixe Galo" que já existia, pelo mesmo motivo.

`cientifico` e `tamanhoMaximo` vivem **só no aparelho**: não há coluna para eles
no banco, e os mapeadores do `sync.js` não os enviam. Criar coluna exigiria SQL,
que só o Alex roda. Por isso `aplicarRemoto()` preserva os dois quando o peixe
volta do servidor — senão a primeira sincronização apagaria a tabela toda.

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

### Vitórias e títulos

**Vitória só conta em etapa encerrada** (`etapasComResultado` em `pontuacao.js`).
Com a etapa aberta o líder muda a cada peixe, então o pódio da etapa em
andamento diz "liderando agora", não "campeão". Etapa encerrada **sem nenhuma
pesca** também não vale título — senão o primeiro nome em ordem alfabética
viraria campeão de uma pescaria que ninguém foi.

O quadro de títulos ordena como quadro de medalhas: **vitórias → 2ºs → 3ºs →
pontos**. Quem levou uma etapa passa na frente de quem somou mais pontos sem
ganhar nenhuma. Quem não pescou na etapa não recebe colocação nela.

O quadro só aparece com **duas ou mais** etapas encerradas; com uma só ele
repetiria o pódio logo acima.

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

> ⚠️ **Ao adicionar/alterar tabela ou gatilho no banco, re-rode o
> `supabase/schema.sql`** no SQL Editor (é idempotente). Vale para gatilho, não
> só para tabela: código corrigido com banco antigo deixa o defeito vivo em
> produção sem dar erro em lugar nenhum.
>
> O banco do grupo está **em dia** — última aplicação em 12/08/2026, pelo Alex,
> cobrindo a tabela `pescadores` e o gatilho `carimbar_atualizacao`.

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
10. **A marca d'água do sync vem do DADO, nunca de `new Date()`.** Ela guardava
    o relógio local, e bastava o celular estar alguns minutos adiantado para
    gravar uma marca no futuro: tudo que os outros registrassem naquele
    intervalo tinha carimbo menor e **nunca mais era pedido** — sumia em
    silêncio, sem erro na tela. Hoje `baixarMudancas()` devolve `ateOnde`, o
    maior `atualizada_em` recebido, e é isso que fica gravado. Regra isolada em
    `carimboMaisRecente()`, com teste em `tests/sync.test.js`.
11. **A descida é paginada, e por `offset`.** Um `limit` fixo truncava em
    silêncio: a marca avançava por cima do que não coubera. E não dá para
    paginar "continuando do último carimbo" porque um insert em lote grava
    todas as linhas com o mesmo `now()` (é o tempo da transação) — a mesma
    página voltaria para sempre.
12. **Sync notifica UMA vez, via `emLote()`.** `aplicarRemoto()` roda por
    registro e cada `notificar()` redesenha quatro telas inteiras: 100
    registros viravam 400 redesenhos com `innerHTML` e releitura das fotos.
    Quem escrever laço que mexe em muitos registros deve envolvê-lo em
    `emLote()`. O ouvinte de `aoMudar` recebe um **Set** de motivos.
13. **A tela de Ajustes não escreve em campo que está sendo digitado.** Ela é
    redesenhada a cada mudança de estado — inclusive a do sync, a cada 20 s —
    e apagava a calibragem e as credenciais do Supabase no meio da digitação.
    Use `preencherCampo()` para escrever e `liberarCampos()` ao salvar.
14. **Só revogue `objectURL` de foto depois de trocar o `innerHTML`.** Duas
    renderizações do histórico se cruzam (ler foto é assíncrono); revogar no
    começo matava as URLs que a outra tinha acabado de colar na tela. Há um
    contador de geração para a renderização atrasada desistir. A foto ampliada
    cria a **própria** URL pelo mesmo motivo.
15. **O banco recusa escrita mais velha que a gravada.** O `merge-duplicates`
    do PostgREST sobrescreve sem olhar data: a lista de peixes padrão que um
    celular novo cria (carimbada em 1970 de propósito) ressuscitava, para o
    grupo inteiro, peixe que já tinha sido tirado da lista. O gatilho
    `carimbar_atualizacao` agora devolve `old` nesse caso. O gatilho é
    `before update`, então o `old` sempre existe. **Já aplicado no banco do
    grupo em 12/08/2026.**
16. **`abrir()` e `fechar()` moram em `ui.js`, não em `modais.js`.** O `pwa.js`
    abre o modal de instalação; se ele importasse `modais.js` para isso,
    fecharia um ciclo entre os dois módulos. Quem for criar modal novo importa
    de `ui.js`. Há também `temModalAberto()`, usado para não empilhar um modal
    em cima de outro na primeira abertura.
17. **O convite de instalação é só para celular** (`pointer: coarse` + tela
    estreita). Num PC o app até instala, mas o ganho real — abrir sem sinal na
    beira do rio, ícone na mão — é do celular, e a faixa só atrapalharia. Quem
    dispensa não vê de novo por 14 dias; o botão em Ajustes continua valendo.
18. **Navegação NUNCA pode ser respondida com resposta redirecionada.** O
    install cacheia `./index.html`, mas servidor com clean URLs responde
    **301/308** nessa URL — a Vercel por `cleanUrls: true`, o `serve` do
    `npm run dev` por padrão. O que fica no cache é uma resposta marcada como
    `redirected`, e devolvê-la para uma navegação faz o Chrome **derrubar a
    página**: `ERR_FAILED`, sem nada no log do servidor, como se o app não
    existisse. Hoje o handler casa com a **raiz** (`"./"`, que é 200 limpo) e
    passa por `semRedirect()`, que reconstrói a resposta se preciso.
    Produção escapava por sorte: o 308 da Vercel aponta para `/`, a mesma URL
    da navegação, e aí o Chrome aceita. O `serve` redireciona para `/index`,
    URL diferente — e o dev local quebrava da segunda abertura em diante.
19. **Service worker ruim não se autocorrige com a aba aberta.** Se um SW que
    derruba a navegação chegar a controlar o aparelho, a versão corrigida é
    baixada mas fica em *waiting*: `skipWaiting()` só é chamado pela mensagem
    `ASSUMIR_CONTROLE`, e a página nunca abre para mandá-la. A saída é
    **fechar todas as abas do app e abrir de novo** — aí o antigo é liberado e
    o novo assume. Vale saber antes de mandar alguém "limpar dados do site".
20. **Peixe padrão novo é semeado por AUSÊNCIA DE NOME, não por store vazio.**
    `garantirPeixesPadrao()` fazia `if (existentes.length) return`, e com isso
    espécie nova no `config.js` nunca chegava a quem já tinha o app — a lista
    saltou de 8 para 34 e todos os aparelhos em uso ficariam com os 8 antigos.
    A função também **completa** `cientifico`/`tamanhoMaximo` em peixe que já
    existia (sem isso o Robalo, o mais usado, ficava com régua de 100 em vez de
    120 cm), mas **nunca** toca em `fator`, `modo` ou `removido`: aquilo é
    decisão do grupo, isto é catálogo. E não mexe no `atualizadaEm`, para o
    registro não parecer escrita nova no last-write-wins.
21. **`npm run dev` não manda `Cache-Control`.** O `serve` responde só com
    ETag, e o Chrome então cacheia `js/` e `css/` por heurística: você edita um
    módulo, recarrega e continua rodando o antigo — sem erro, sem pista, e o
    teste "falha" por um motivo que não existe. Some com isso servindo com
    `npx http-server . -p 5003 -c-1`, que manda `no-store`. Cuidado para não
    confundir com o cache do service worker, que é cache-first por versão: se a
    `VERSAO` não subiu, ele também serve arquivo velho.
22. **No iPhone, "Adicionar à Tela de Início" só existe no Safari.** Chrome e
    Firefox no iOS não têm a opção — é restrição do sistema. O modal detecta o
    navegador (`CriOS`/`FxiOS`/`EdgiOS` no user agent) e manda abrir no Safari;
    sem esse aviso a pessoa procura um menu que não existe e desiste.

## Estado do roadmap

Feito: Vercel-ready, PWA completo, etapas, edição, IndexedDB, export JSON/XML/CSV,
tela de ajustes, sincronização.

**No ar desde 11/08/2026:** https://bigode-pescador.vercel.app — Vercel com
auto-deploy, Supabase provisionado e sync validado ponta a ponta em produção.
Detalhes e o que sobrou estão em [`BACKLOG.md`](BACKLOG.md).

> A Vercel e o Supabase estão na conta do **Alex**. A Vercel exige ser *dono* do
> repositório para importar um projeto — colaborador não consegue, e isso não é
> limitação de plano.
