# 🎣 Bigode Pescador

### 👉 **[bigode-pescador.vercel.app](https://bigode-pescador.vercel.app)**

App do campeonato de pesca da turma. Registre cada peixe, veja a classificação
atualizar na hora e instale no celular como aplicativo.

Funciona **offline** — na beira do rio o sinal cai, e o app não pode cair junto.

## Instalar no celular

**Android (Chrome):** abra o link, toque no menu **⋮** → *Instalar app*. Ou aceite
o aviso que aparece sozinho.

**iPhone (precisa ser pelo Safari):** abra o link, toque em **Compartilhar** (o
quadrado com a seta), role e toque em *Adicionar à Tela de Início*. No Chrome do
iPhone a opção não existe — é limitação da Apple.

Depois de instalado, **segure o ícone** do app: aparece o atalho *Registrar peixe*,
que abre direto no formulário. É o caminho mais rápido durante a pescaria.

## O que dá pra fazer

- 🏆 **Etapas** — cada pescaria é um campeonato com ranking próprio, e existe
  uma classificação geral somando todas.
- 🥇 **Pódio** — o campeão da etapa em degraus e o quadro de **títulos**, que
  mostra quem mais ganhou etapas. Vitória só conta em etapa encerrada.
- ➕ **Registrar peixe** em poucos toques: pescador, peixe, peso (kg ou g) e
  tamanho no slider. A pontuação aparece enquanto você digita, com a conta.
- 📷 **Foto** de cada peixe, tirada na hora ou da galeria.
- ✏️ **Editar e remover** pescas já registradas.
- 🐟 **Cadastrar peixe novo**, por fórmula ou pontuação fixa.
- ⚙️ **Calibrar a pontuação** — o grupo ajusta os fatores sem mexer no código.
- 🔄 **Sincronizar** entre os celulares de todo mundo (opcional).
- 📤 **Exportar** em JSON, XML e CSV, e compartilhar o placar no WhatsApp.
- 📲 **Instalável** no Android e no iPhone, com atalho que já abre no formulário.

## Pontuação

A regra é do Rodrigo, da **tabela oficial das espécies** que ele fechou em
12/08/2026:

```
pontuação = pontos da espécie + comprimento(cm) + peso(g) ÷ 100
```

Exemplo da própria tabela: Robalo Flecha de 72 cm e 4.300 g →
`300 + 72 + 43` = **415 pontos**.

E vêm com ela duas regras que mudam como se pesca:

- 🎯 **Bônus:** quem pegar **5 espécies diferentes** na etapa leva **+300**.
  Variedade passou a valer mais que insistir no mesmo peixe.
- ⚠️ **Penalidade:** cada **baiacu** tira **100 pontos**, não importa o tamanho.

| Faixa da tabela | Pontos | Espécies |
|---|:--:|---|
| Peixe Galo 🏆 | 600 | o "super trunfo": o dobro do robalo |
| Alto valor esportivo | 300 | robalo (flecha e peva), caranha, pescada, traíra, garoupa, badejo, linguado, anchova, olhete, tucunaré |
| Médio valor | 200 | xaréu, cioba, bonito, pescada amarela, pampo, vermelho, serra, jundiá |
| Valor padrão | 100 | sororoca, corvina, sargo, carapeba |
| Bagres e menor valor | 50 | tainha, os 4 bagres, mandi, parati |
| Baiacu ⚠️ | −100 | fixo, por exemplar |

São **34 espécies** cadastradas, cada uma com nome científico e comprimento
máximo — e é esse máximo que ajusta a régua do formulário: garoupa vai até
150 cm, carapeba até 50. Tudo editável em **Ajustes → Peixes e pontos**.

> ℹ️ A regra anterior era `fator × peso + fator × tamanho`, e nela o **peso valia
> 98%** da nota: peixe curto e gordo ganhava de robalo comprido. A fórmula nova
> equilibra — no robalo de 4,3 kg do exemplo, a espécie vale 72%, o comprimento
> 17% e o peso 10%.

## Sincronizar entre os celulares

O banco do grupo **já está no ar** (Supabase, provisionado pelo Alex em 11/08).

**Para entrar nele:** peça o **link de acesso** no grupo — quem já está
sincronizado gera em *Ajustes → Sincronização → Copiar link de acesso*. Abrir o
link é tudo: o app se configura sozinho, sem digitar nada.

Sem isso, o app funciona normalmente, só que cada aparelho guarda as próprias
pescas e o chip no topo mostra **"só neste aparelho"**.

O que sincroniza: **etapas, pescas, peixes e a lista de pescadores**. As **fotos
não sobem** — ficam no aparelho de quem tirou, para não estourar a cota do plano
gratuito.

<details>
<summary>Montar um banco do zero (só se for começar outro campeonato)</summary>

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. Em **SQL Editor**, cole o [`supabase/schema.sql`](supabase/schema.sql) inteiro
   e clique em *Run*.
3. Em **Project Settings → API**, copie a *Project URL* e a chave *anon/public*.
4. No app: **Ajustes → Sincronização**, cole as duas e salve.
5. Toque em **Copiar link de acesso** e mande no grupo.

> O `schema.sql` é idempotente — rodar de novo não apaga nada. **Rode outra vez
> sempre que o arquivo mudar**, senão as tabelas novas não existem no banco e o
> sync dá 404.

</details>

## Rodando localmente

```bash
npm run dev     # sobe em http://localhost:5000
npm test        # testes da regra de pontuação
```

Não há build. É HTML, CSS e JavaScript puro com módulos nativos.

> ⚠️ Abrir o `index.html` com duplo clique **não** funciona mais: módulos e
> service worker exigem `http://`. Use `npm run dev`.

## Estrutura

```
index.html              telas, modais e cabeçalho do PWA
styles.css              tema escuro, safe areas de iOS
manifest.webmanifest    nome, ícones e atalhos do app instalado
service-worker.js       cache offline
js/
  app.js                ponto de entrada
  config.js             peixes padrão, pescadores, constantes
  estado.js             modelo de dados e operações
  db.js                 IndexedDB (pescas, fotos, fila de sync)
  pontuacao.js          a regra do campeonato
  ui.js                 renderização das telas
  modais.js             formulários
  ajustes.js            tela de ajustes, export e import
  sync.js               sincronização com o Supabase
  pwa.js                service worker, instalação e atalhos
supabase/schema.sql     banco, pronto para colar
tests/                  testes da pontuação
```

## Tecnologia

HTML, CSS e JavaScript puro, sem framework e sem build. Dados no **IndexedDB**
(as fotos também), sincronização opcional via **Supabase**, hospedagem na
**Vercel**.

Detalhes de arquitetura e roadmap: [`CLAUDE.md`](CLAUDE.md) e [`BACKLOG.md`](BACKLOG.md).
