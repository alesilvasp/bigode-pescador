# Backlog — Bigode Pescador

Contexto de arquitetura está no [`CLAUDE.md`](CLAUDE.md).

---

## ✅ Feito

| Item | Observação |
|---|---|
| ~~1. Deploy na Vercel~~ | Repo pronto: `vercel.json` configurado, sem build. Falta só ligar o repo na conta. |
| ~~2. PWA instalável + offline~~ | Manifest, service worker, ícones, atalhos, meta tags de iOS. |
| ~~3. Editar pesca registrada~~ | Botão "editar" no histórico, reaproveitando o modal. |
| ~~4. Exportar / compartilhar~~ | JSON, XML e CSV, mais o placar em texto pela Web Share API. |
| ~~5. Fotos no IndexedDB~~ | Guardadas como Blob; a pesca carrega só o id. |

Também entraram, fora da lista original:

- **Etapas** — cada pescaria com ranking próprio + classificação geral.
- **Modo de pontuação fixa** — peixe que vale sempre o mesmo, independentemente
  de peso e tamanho. Nenhum peixe padrão usa; fica disponível em Ajustes.
- **Tela de ajustes** — fatores, calibragem da fórmula, pescadores.
- **Sincronização** entre os aparelhos via Supabase, offline-first.
- **Importar JSON** — contrapartida do export.
- **Recordes e destaque do líder**.
- **Testes** da regra de pontuação (`npm test`).

---

## Infra em produção (feito em 06/08)

- **Vercel ligado** — auto-deploy a cada push na `main`:
  https://bigode-pescador.vercel.app
- **Supabase provisionado** — projeto criado, `schema.sql` aplicado no SQL Editor,
  credenciais coladas no app (Ajustes → Sincronização). **Sync validado ponta a
  ponta em produção** (upload subindo pras tabelas `etapas`/`peixes`/`pescas`).
- **3 correções no `js/sync.js`** durante a validação — quem já tinha clonado
  precisa dar `git pull`:
  1. Resposta sem corpo do Supabase (POST `return=minimal` devolve **201 vazio**)
     — evita `Unexpected end of JSON input`.
  2. `?columns=` no insert em lote — evita `PGRST102 "All object keys must match"`.
  3. Mapeadores nunca emitem `undefined` em coluna `NOT NULL` — evita `23502`
     em `pontos_fixos`.

> Para os outros 3 pescadores entrarem no mesmo banco: mesma **URL + anon key**
> (ou o link de convite da tela de Ajustes).

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
