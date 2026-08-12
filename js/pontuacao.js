// =========================================================================
//  Pontuação — a regra oficial do campeonato.
//
//  FÓRMULA OFICIAL, da tabela que o Rodrigo mandou no grupo em 12/08/2026:
//
//      pontuação = pontos da espécie + comprimento(cm) + peso(g) ÷ 100
//
//  Caso de referência da própria tabela, que os testes usam como âncora:
//      Robalo Flecha, 72 cm, 4.300 g  →  300 + 72 + 43  =  415 pontos
//
//  Mais duas regras que vêm com ela:
//      • BÔNUS de +300 para quem pegar 5 espécies diferentes na competição
//      • PENALIDADE de -100 por exemplar de baiacu (pontuação fixa)
//
//  Isto SUBSTITUIU `fator × peso + fator × tamanho`, que valeu até 11/08. A
//  regra velha fazia o peso ser 98% da nota: um peixe curto e gordo ganhava de
//  um robalo comprido, e foi o que o Alex apontou no grupo. Na fórmula nova, o
//  mesmo robalo de 4,3 kg fica em 72% espécie, 17% comprimento, 10% peso.
//
//  Os multiplicadores existem só para o grupo calibrar pela tela de Ajustes.
//  Ambos em 1 = regra oficial, intacta.
// =========================================================================

import { AJUSTES_PADRAO } from "./config.js";

/** Lê um ajuste numérico, caindo no padrão quando vier vazio ou inválido. */
function ajuste(ajustes, chave) {
  const valor = Number(ajustes?.[chave]);
  return Number.isFinite(valor) ? valor : Number(AJUSTES_PADRAO[chave]);
}

/**
 * Calcula os pontos de uma pesca.
 *
 * @param {object} peixe    - { fator, modo, pontosFixos } — `fator` são os
 *                            PONTOS DA ESPÉCIE (ver config.js)
 * @param {number} pesoGramas
 * @param {number} tamanhoCm
 * @param {object} [ajustes] - multiplicadores; usa os padrão se omitido
 * @returns {number} pontos, arredondados
 */
export function calcularPontuacao(peixe, pesoGramas, tamanhoCm, ajustes = AJUSTES_PADRAO) {
  if (!peixe) return 0;

  // Pontuação fixa ignora peso e tamanho. É o caso do baiacu: -100 por
  // exemplar, não importa o bicho.
  if (peixe.modo === "fixa") {
    return Math.round(Number(peixe.pontosFixos) || 0);
  }

  return Math.round(
    parcelaEspecie(peixe) + parcelaTamanho(tamanhoCm, ajustes) + parcelaPeso(pesoGramas, ajustes)
  );
}

const parcelaEspecie = (peixe) => Number(peixe.fator) || 0;

const parcelaTamanho = (tamanhoCm, ajustes) =>
  (Number(tamanhoCm) || 0) * ajuste(ajustes, "multiplicadorTamanho");

const parcelaPeso = (pesoGramas, ajustes) => {
  const divisor = ajuste(ajustes, "divisorPeso") || 1; // divisor 0 não existe
  return ((Number(pesoGramas) || 0) / divisor) * ajuste(ajustes, "multiplicadorPeso");
};

/**
 * Explica a conta em texto, para mostrar na interface.
 * Ajuda o pessoal a entender de onde saiu o número — e a discutir a regra.
 */
export function explicarPontuacao(peixe, pesoGramas, tamanhoCm, ajustes = AJUSTES_PADRAO) {
  if (!peixe) return "";

  if (peixe.modo === "fixa") {
    return `${peixe.nome}: ${peixe.pontosFixos} pontos fixos`;
  }

  const especie = parcelaEspecie(peixe);
  const tamanho = parcelaTamanho(tamanhoCm, ajustes);
  const peso = parcelaPeso(pesoGramas, ajustes);
  const total = Math.round(especie + tamanho + peso);

  return `${especie} + ${formatarNumero(tamanho)} + ${formatarNumero(peso)} = ${total}`;
}

function formatarNumero(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Consolida o ranking de um conjunto de pescas.
 *
 * @param {Array} pescas     - pescas já filtradas (por etapa, ou todas)
 * @param {Array<string>} pescadores
 * @returns {Array} estatística por pescador, ordenada
 */
export function montarRanking(pescas, pescadores, ajustes = AJUSTES_PADRAO) {
  const valorBonus = ajuste(ajustes, "bonusEspecies");
  const minimoEspecies = ajuste(ajustes, "especiesParaBonus");

  const stats = pescadores.map((nome) => {
    const minhas = pescas.filter((p) => p.pescador === nome && !p.removida);
    const pontosBase = minhas.reduce((s, p) => s + (Number(p.pontuacao) || 0), 0);

    // Bônus: "ao capturar 5 espécies diferentes durante a competição, o pescador
    // receberá +300". Conta POR ETAPA, e não sobre o conjunto todo, para o
    // ranking geral ser a soma dos rankings de etapa. Contando espécies
    // distintas no geral, alguém que fez 5 espécies espalhadas em 3 pescarias
    // ganharia um bônus que não apareceu em nenhuma etapa — e a soma das etapas
    // deixaria de fechar com o geral.
    const porEtapa = new Map();
    minhas.forEach((p) => {
      const etapa = p.etapaId ?? "";
      if (!porEtapa.has(etapa)) porEtapa.set(etapa, new Set());
      porEtapa.get(etapa).add(p.tipo);
    });
    const etapasComBonus = [...porEtapa.values()].filter((e) => e.size >= minimoEspecies).length;
    const bonus = etapasComBonus * valorBonus;

    return {
      nome,
      qtd: minhas.length,
      maior: minhas.reduce((m, p) => Math.max(m, Number(p.tamanho) || 0), 0),
      pesoTotal: minhas.reduce((s, p) => s + (Number(p.pesoGramas) || 0), 0),
      especies: new Set(minhas.map((p) => p.tipo)).size,
      pontosBase,
      bonus,
      etapasComBonus,
      pontos: pontosBase + bonus,
      // Guardado para desempate e para o card de destaque.
      melhorPesca: minhas.reduce(
        (melhor, p) => (!melhor || p.pontuacao > melhor.pontuacao ? p : melhor),
        null
      ),
    };
  });

  // Pontos (desc) → peso total (desc) → maior peixe (desc) → nome (asc).
  stats.sort(
    (a, b) =>
      b.pontos - a.pontos ||
      b.pesoTotal - a.pesoTotal ||
      b.maior - a.maior ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );

  return stats;
}

/**
 * Quem ganhou uma etapa.
 *
 * Recebe as pescas JÁ filtradas pela etapa. Devolve a linha do ranking do
 * primeiro colocado, ou `null` se ninguém registrou nada: etapa sem peixe não
 * tem campeão, e sem isto o primeiro nome da lista em ordem alfabética viraria
 * "campeão" de uma etapa vazia.
 */
export function campeaoDaEtapa(pescasDaEtapa, pescadores, ajustes = AJUSTES_PADRAO) {
  const primeiro = montarRanking(pescasDaEtapa, pescadores, ajustes)[0];
  return primeiro && primeiro.qtd > 0 ? primeiro : null;
}

/**
 * Etapas que já valeram título: encerradas e com pelo menos uma pesca.
 *
 * Enquanto a etapa está aberta o líder muda a cada peixe, então vitória só
 * conta depois de encerrada — é o que separa "está ganhando" de "ganhou".
 */
export function etapasComResultado(etapas, pescas) {
  return etapas.filter(
    (e) =>
      !e.removida &&
      e.encerrada &&
      pescas.some((p) => p.etapaId === e.id && !p.removida)
  );
}

/**
 * Quadro de títulos: quantas etapas cada um ganhou.
 *
 * Ordena como quadro de medalhas — vitórias, depois 2ºs, depois 3ºs — e só
 * então por pontos. Alguém com uma vitória fica na frente de quem somou mais
 * pontos sem ganhar nenhuma: aqui o que conta é levar a etapa.
 *
 * @returns {Array} { nome, vitorias, segundos, terceiros, etapas, pontos, ganhas }
 */
export function contarTitulos(etapas, pescas, pescadores, ajustes = AJUSTES_PADRAO) {
  const linhas = new Map(
    pescadores.map((nome) => [
      nome,
      { nome, vitorias: 0, segundos: 0, terceiros: 0, etapas: 0, pontos: 0, ganhas: [] },
    ])
  );

  for (const etapa of etapasComResultado(etapas, pescas)) {
    const daEtapa = pescas.filter((p) => p.etapaId === etapa.id && !p.removida);

    // Quem não pescou na etapa não entra na contagem dela — senão três pessoas
    // empatadas em zero ganhariam "2º, 3º e 4º lugar" sem ter ido pescar.
    const colocados = montarRanking(daEtapa, pescadores, ajustes).filter((r) => r.qtd > 0);

    colocados.forEach((r, i) => {
      const linha = linhas.get(r.nome);
      if (!linha) return; // pescador saiu da lista depois da etapa
      linha.etapas++;
      linha.pontos += r.pontos;
      if (i === 0) {
        linha.vitorias++;
        linha.ganhas.push(etapa.nome);
      } else if (i === 1) {
        linha.segundos++;
      } else if (i === 2) {
        linha.terceiros++;
      }
    });
  }

  return [...linhas.values()].sort(
    (a, b) =>
      b.vitorias - a.vitorias ||
      b.segundos - a.segundos ||
      b.terceiros - a.terceiros ||
      b.pontos - a.pontos ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );
}

/**
 * Recalcula a pontuação de todas as pescas — usado quando o grupo muda um
 * fator ou um multiplicador na tela de Ajustes.
 *
 * Devolve novas pescas, sem mutar as originais.
 */
export function recalcularTodas(pescas, peixesPorNome, ajustes) {
  return pescas.map((p) => {
    const peixe = peixesPorNome.get(p.tipo);
    if (!peixe) return p; // peixe some da lista: mantém o snapshot antigo
    const pontuacao = calcularPontuacao(peixe, p.pesoGramas, p.tamanho, ajustes);
    if (pontuacao === p.pontuacao && peixe.fator === p.fator) return p;
    return { ...p, fator: peixe.fator, pontuacao, atualizadaEm: new Date().toISOString() };
  });
}
