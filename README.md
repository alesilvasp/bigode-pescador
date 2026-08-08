# 🎣 Campeonato de Pesca

App simples para registrar as pescas de um campeonato entre amigos e ver a
classificação atualizar em tempo real. Sem instalação, sem servidor — é só abrir.

## Funcionalidades

- 🏆 **Campeonato**: ranking dos 4 pescadores, ordenado por pontos, com medalhas.
- 📜 **Histórico**: todas as pescas registradas, com foto, peso, tamanho e pontos.
- ➕ **Nova pesca**: escolha o pescador, o peixe, informe peso (kg ou g) e o
  tamanho no slider. A pontuação aparece na hora.
- 🐟 **Cadastrar peixe novo** direto no app, definindo o fator dele.
- 📷 **Foto opcional** de cada peixe (da galeria ou tirada na hora).

## Pontuação

```
pontuação = fator do peixe × peso(g) + fator do peixe × tamanho(cm)
```

| Peixe | Fator |
|-------|:-----:|
| Peixe Galo (troféu) | 10 |
| Robalo | 5 |
| Caranha | 5 |
| Traíra | 5 |
| Corvina | 4 |
| Pescada | 4 |
| Bagre | 3 |
| Baiacu (penalidade) | -0,5 |

## Rodando localmente

Abra o `index.html` no navegador, ou sirva a pasta:

```bash
npx serve .
```

## Tecnologia

HTML, CSS e JavaScript puro. Dados salvos no `localStorage` do navegador.
Detalhes técnicos e roadmap (Vercel, PWA) estão no [`CLAUDE.md`](CLAUDE.md).
