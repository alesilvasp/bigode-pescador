# Backlog — Bigode Pescador

Contexto de arquitetura está no [`CLAUDE.md`](CLAUDE.md).

---

## ✅ Feito

| Item | Observação |
|---|---|
| ~~1. Deploy na Vercel~~ | **No ar:** https://bigode-pescador.vercel.app — auto-deploy a cada push. |
| ~~2. PWA instalável + offline~~ | Manifest, service worker, ícones, atalhos, meta tags de iOS. |
| ~~3. Editar pesca registrada~~ | Botão "editar" no histórico, reaproveitando o modal. |
| ~~4. Exportar / compartilhar~~ | JSON, XML e CSV, mais o placar em texto pela Web Share API. |
| ~~5. Fotos no IndexedDB~~ | Guardadas como Blob; a pesca carrega só o id. |

Também entraram, fora da lista original:

- **Etapas** — cada pescaria com ranking próprio + classificação geral.
- **Modo de pontuação fixa** — peixe que vale sempre o mesmo, independentemente
  de peso e tamanho. Nenhum peixe padrão usa; fica disponível em Ajustes.
- **Tela de ajustes** — fatores, calibragem da fórmula, pescadores.
- **Sincronização** entre os aparelhos via Supabase, offline-first — etapas,
  pescas, peixes e a **lista de pescadores**.
- **Link de acesso** — quem abre já entra sincronizado, sem digitar credencial.
- **Importar JSON** — contrapartida do export.
- **Recordes e destaque do líder**.
- **Testes** da regra de pontuação (`npm test`).

---

## Infra em produção (11/08/2026)

- **Vercel ligada** — auto-deploy a cada push na `main`:
  https://bigode-pescador.vercel.app
  Projeto na conta do **Alex**: a Vercel exige ser *dono* do repositório para
  importar, e colaborador não consegue. Não é limitação de plano.
- **Supabase provisionado** — projeto criado, `schema.sql` aplicado, credenciais
  coladas no app. **Sync validado ponta a ponta em produção.**
- **3 correções no `js/sync.js`** durante a validação — quem clonou antes precisa
  dar `git pull`:
  1. Resposta sem corpo do Supabase (POST `return=minimal` devolve **201 vazio**)
     — evita `Unexpected end of JSON input`.
  2. `?columns=` no insert em lote — evita `PGRST102 "All object keys must match"`.
  3. Mapeadores nunca emitem `undefined` em coluna `NOT NULL` — evita `23502`
     em `pontos_fixos`.
- **`npm test` corrigido** — estava com glob (`tests/*.test.js`), que quebra no
  Windows (o npm roda pelo `cmd.exe`, que não expande) e ainda saía com **código
  0**: o teste não rodava e nada acusava. Voltou para `node --test tests/`.
- **Validação em produção** — HTTPS, service worker com 21 arquivos em cache,
  instalabilidade, atalho do ícone, headers do `vercel.json` e console limpo.
  31 testes passando.

> Para os outros entrarem no mesmo banco: peça o **link de acesso** no grupo
> (Ajustes → Sincronização → Copiar link de acesso). Abrir o link basta.

---

## Rodada de QA ponta a ponta (11/08/2026)

Varredura do app inteiro, com o fluxo real rodando no navegador. **15 defeitos
corrigidos**, testes de 31 → 48. Detalhe técnico de cada um está nas
"Armadilhas já resolvidas" do [`CLAUDE.md`](CLAUDE.md).

> ⚠️ **Re-rode o `supabase/schema.sql`** no SQL Editor. O gatilho de carimbo
> mudou (ver item 4 abaixo). É idempotente, rodar de novo não quebra nada.

### Perdiam dado, em silêncio

1. **O sync parava de baixar se o relógio do celular estivesse adiantado.** A
   marca de "até onde já vi" era o relógio local; alguns minutos à frente e
   tudo que os outros registrassem naquela janela ficava invisível **para
   sempre**, sem erro na tela. Agora a marca vem do carimbo que o servidor
   devolveu.
2. **A descida cortava em 1000 registros sem avisar** e a marca passava por
   cima do resto. Agora pagina até o fim.
3. **Reimportar o mesmo JSON duplicava o campeonato inteiro** — os ids do
   arquivo eram descartados, então nada nunca "já existia".
4. **Peixe tirado da lista voltava sozinho.** Quem instalasse o app num celular
   zerado subia a lista padrão por cima do banco, e o peixe removido voltava
   para todo mundo. O banco agora recusa escrita mais velha que a gravada.
5. **Editar a pesca de um pescador removido trocava o dono dela** (ou travava o
   formulário sem dizer por quê). O nome volta ao seletor marcado como "fora
   da lista".

### Atrapalhavam na hora de usar

6. **A tela de Ajustes apagava o que você estava digitando.** Ela é redesenhada
   a cada sync — de 20 em 20 segundos — e a calibragem voltava para `1` e a URL
   do Supabase esvaziava no meio da colagem.
7. **O sync congelava o celular:** cada registro baixado redesenhava quatro
   telas inteiras. 100 registros = 400 redesenhos. Agora é um por sincronização.
8. **Foto sumia da tela sozinha** quando duas renderizações do histórico se
   cruzavam, e a **foto ampliada quebrava** ao chegar um sync.
9. **Remover a última etapa deixava o app sem onde registrar** até alguém
   recarregar a página.
10. **Peixe acima de 1 metro era cortado para 1 metro** — o slider era fixo e o
    `tamanhoMaximo` dos ajustes nunca tinha sido ligado. A régua agora cresce.
11. **Dava para digitar o tamanho.** Mirar 47,5 cm num slider com a mão molhada
    era o pior momento do formulário.

### Menores

12. **CSV abria quebrado no Excel** — sem BOM (`Traíra` virava `TraÃ­ra`) e
    separado por vírgula, o que joga tudo numa coluna só em português.
13. **"Buscar atualização" dizia "já está na versão mais recente"** mesmo tendo
    acabado de encontrar uma nova.
14. **O aviso de versão nova podia sumir** antes de alguém ver, comido pelo
    cronômetro de um aviso anterior.
15. **Escape não fechava a foto ampliada**; a contagem de pendentes não
    atualizava ao remover peixe; nomes com acento eram ordenados depois do "Z";
    e o cabeçalho do service worker descrevia o oposto do que o código faz.

---

## Pendências com o grupo (não são código)

### ⚖️ Aberta: o peso dominar é intencional?

Como entra em gramas, um robalo de 2 kg dá 10.350 pontos e o tamanho vira 3% do
total — na prática o campeonato vira "quem pegou o mais pesado". Dá para
equilibrar em **Ajustes → Calibragem** sem tocar no código: multiplicador de peso
`0,001` faz o peso contar em kg.

### ✅ Resolvidas relendo as mensagens

- **Pescada = 5.** O Rodrigo disse *"mesmo peso de caranha e pescada e robalo"*.
  O código tinha 4; corrigido.
- **Bagre = 2.** Estava na primeiríssima mensagem dele: *"fator de relevância do
  peixe (robalo - 5 / bagre - 2)"*. O código tinha 3; corrigido.
- **Peixes de pontuação fixa removidos.** Os valores (Arraia 50, Tubarão 75,
  Peixe Espada 60, Tucunaré 120) eram brincadeira do Luis Fellipe, não regra.
- **Corvina = 4**, confirmado pelo Alex em 11/08. Vale saber que é o único fator
  que **não** vem do Rodrigo: a tabela do Alex em 06/08 dizia 2, ele nunca se
  manifestou sobre a corvina, e o 4 provavelmente veio do próprio código. Se
  algum dia parecer desproporcional, é ali que está a folga.

---

## Próximos passos possíveis

### 0. Usar numa pescaria de verdade ⭐
O único teste que ninguém conseguiu fazer ainda. Sol batendo na tela, mão molhada,
peixe se debatendo, sinal ruim e bateria caindo. É onde vão aparecer as coisas
que nenhum teste automatizado pega — tamanho de botão, contraste, quantos toques
até registrar. Anotar o que incomodar e trazer para cá.

### 1. Fotos no Supabase Storage
Hoje a foto fica só no aparelho de quem tirou — quem sincroniza vê a pesca, mas
não a foto. Subir para o Storage resolveria, ao custo de cota e complexidade.
Avaliar se o grupo sente falta antes de fazer.

### 2. Filtro e busca no histórico
Já filtra por pescador. Falta filtrar por peixe e por faixa de data.

### 3. Local da pescaria com GPS
Capturar coordenadas ao registrar (`navigator.geolocation`), opcional, para
marcar os pontos bons. Exige cuidado com permissão e com bateria.

### 4. Regras de desempate configuráveis
Hoje é fixo: pontos → peso total → maior peixe → nome. Poderia ser escolhido.

### 5. Modo "só leitura" para visitantes
Alguém acompanhar o campeonato sem poder registrar.

### 6. Notificação quando alguém passa você
Com o sync ligado, avisar que o placar mudou. Precisa de push, que no iOS só
funciona com o app instalado.
