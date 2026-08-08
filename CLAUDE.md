# Campeonato de Pesca

App web para registrar pescas durante um campeonato entre amigos e acompanhar a
classificação em tempo real. Feito em **HTML + CSS + JavaScript puro (vanilla)**,
sem build e sem dependências — basta abrir no navegador.

## Como rodar

Como é estático, qualquer uma das opções funciona:

- Abrir o `index.html` direto no navegador (duplo clique).
- Ou servir localmente (recomendado, evita restrições de câmera/arquivo em alguns navegadores):
  ```bash
  npx serve .
  # ou
  python -m http.server 8000
  ```

Não há passo de build, lint ou testes por enquanto.

## Estrutura

```
index.html    # marcação: abas, tabela de ranking, histórico, modal e FAB
styles.css    # tema escuro (variáveis CSS em :root), layout responsivo
app.js        # todo o estado, pontuação, persistência e eventos
```

## Como funciona

### Pescadores
Lista fixa em `PESCADORES` (topo do `app.js`). Para mudar os nomes, edite esse array.

### Peixes e pontuação
- Peixes padrão ficam em `PEIXES_PADRAO` (`nome` + `fator`).
- O usuário pode cadastrar um peixe novo pelo próprio app (opção
  "➕ Cadastrar novo peixe…" no select). Esses ficam salvos em `peixesExtra`.
- **Fórmula (em `calcularPontuacao`)**:
  ```
  pontuação = fator × peso(gramas) + fator × tamanho(cm)
  ```
- O peso é sempre armazenado em **gramas**. O formulário aceita entrada em
  **kg ou g** (toggle) e converte (1 kg = 1000 g) antes de calcular.
- Fatores atuais: Robalo 5, Caranha 5, Traíra 5, Corvina 4, Pescada 4, Bagre 3,
  Peixe Galo 10 (troféu), Baiacu -0,5 (penalidade — pontua negativo).

### Persistência
Tudo em `localStorage`, sem backend:
- `campeonato-pesca:pescas` — lista de pescas registradas.
- `campeonato-pesca:peixes-extra` — peixes cadastrados pelo usuário.

Cada pesca guarda `fator` e `pontuacao` como snapshot, então mudar o fator de um
peixe depois **não** altera as pescas já registradas.

### Fotos
Opcionais. A imagem escolhida (galeria ou câmera via `capture="environment"`) é
redimensionada num `<canvas>` e salva como dataURL JPEG (`comprimirImagem`) para
caber no `localStorage`. Clicar na miniatura no histórico abre o lightbox.

> ⚠️ `localStorage` tem ~5 MB. Com muitas fotos isso pode encher. Migrar para
> **IndexedDB** é o próximo passo natural quando o volume crescer.

## Convenções de código

- Vanilla JS, sem framework. Nomes e comentários em **português**.
- CSS com variáveis de tema em `:root`; evitar cores hardcoded.
- Manter `app.js` organizado por seções (config, estado, pontuação,
  persistência, render, eventos) — seguir o padrão já existente.

## Roadmap

- [ ] Deploy na **Vercel** (projeto estático, sem config — só apontar o repo).
- [ ] Transformar em **PWA**: adicionar `manifest.webmanifest` (nome, ícones,
      `theme_color`, `display: standalone`) e um `service-worker.js` para cache
      offline; registrar o SW no `index.html`. Requer HTTPS (a Vercel já entrega).
- [ ] Editar pesca já registrada (hoje só dá pra remover).
- [ ] Exportar/compartilhar resultados do campeonato.
- [ ] Migrar fotos para IndexedDB.
