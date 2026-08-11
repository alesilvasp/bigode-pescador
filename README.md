# 🎣 Bigode Pescador

App do campeonato de pesca da turma. Registre cada peixe, veja a classificação
atualizar na hora e instale no celular como aplicativo.

Funciona **offline** — na beira do rio o sinal cai, e o app não pode cair junto.

## O que dá pra fazer

- 🏆 **Etapas** — cada pescaria é um campeonato com ranking próprio, e existe
  uma classificação geral somando todas.
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

A regra é do Rodrigo:

```
pontuação = fator do peixe × peso(g) + fator do peixe × tamanho(cm)
```

Exemplo dele: Robalo (fator 5) de 100 g e 45 cm → `5×100 + 5×45` = **725 pontos**.

| Peixe | Fator | De onde veio |
|---|:--:|---|
| Peixe Galo 🏆 | 10 | Rodrigo: *"os super trunfo, tipo, peixe galo… colocaria 10 pontos"* |
| Robalo | 5 | Rodrigo: *"fator de relevância do peixe (robalo - 5 / bagre - 2)"* |
| Caranha, Pescada | 5 | Rodrigo: *"mesmo peso de caranha e pescada e robalo"* |
| Traíra | 5 | Alex: *"Traíra? 5?"* → Rodrigo: *"sim sim"* |
| Corvina | 4 | ⚠️ ainda sem confirmação do Rodrigo |
| Bagre | 2 | Rodrigo: *"robalo - 5 / bagre - 2"* |
| Baiacu ⚠️ | −0,5 | Rodrigo: *"a coloca baiacu menos 0,5"* |

Tudo editável em **Ajustes → Peixes e fatores**, incluindo cadastrar peixe novo —
por fórmula ou com **pontuação fixa** (vale sempre o mesmo, independentemente de
peso e tamanho).

> ℹ️ Como o peso entra em **gramas**, ele domina o resultado: um robalo de 2 kg
> dá 10.350 pontos e o tamanho vira 3% do total. É a regra combinada no grupo —
> se quiserem equilibrar, dá para mexer em **Ajustes → Calibragem** sem tocar no
> código (multiplicador de peso `0,001` faz o peso contar em kg).

## Sincronizar entre os celulares

Sem configurar, cada aparelho guarda só as próprias pescas. Para todos verem o
mesmo placar:

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. Em **SQL Editor**, cole o arquivo [`supabase/schema.sql`](supabase/schema.sql)
   inteiro e clique em *Run*.
3. Em **Project Settings → API**, copie a *Project URL* e a chave *anon/public*.
4. No app: **Ajustes → Sincronização**, cole as duas e salve.
5. Toque em **Copiar link de acesso** e mande no grupo — quem abrir o link já
   entra sincronizado, sem digitar nada.

As fotos não sobem: ficam no aparelho de quem tirou.

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
