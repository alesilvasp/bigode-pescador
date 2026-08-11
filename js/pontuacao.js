// =========================================================================
//  Pontuação — a regra oficial do campeonato.
//
//  Definida pelo Rodrigo no grupo (06/08/2026):
//
//      pontuação = fator × peso(gramas) + fator × tamanho(cm)
//
//  Caso de referência dado por ele, que os testes usam como âncora:
//      Robalo (fator 5), 100 g, 45 cm  →  5×100 + 5×45  =  725 pontos
//
//  Os multiplicadores existem só para o grupo poder calibrar pela tela de
//  Ajustes. Ambos em 1 = regra original, intacta.
// =========================================================================

import { AJUSTES_PADRAO } from "./config.js";

/**
 * Calcula os pontos de uma pesca.
 *
 * @param {object} peixe    - { fator, modo, pontosFixos }
 * @param {number} pesoGramas
 * @param {number} tamanhoCm
 * @param {object} [ajustes] - multiplicadores; usa os padrão se omitido
 * @returns {number} pontos, arredondados
 */
export function calcularPontuacao(peixe, pesoGramas, tamanhoCm, ajustes = AJUSTES_PADRAO) {
  if (!peixe) return 0;

  // Peixes de pontuação fixa ignoram peso e tamanho.
  if (peixe.modo === "fixa") {
    return Math.round(Number(peixe.pontosFixos) || 0);
  }

  const fator = Number(peixe.fator) || 0;
  const peso = (Number(pesoGramas) || 0) * (Number(ajustes.multiplicadorPeso) ?? 1);
  const tamanho = (Number(tamanhoCm) || 0) * (Number(ajustes.multiplicadorTamanho) ?? 1);

  return Math.round(fator * peso + fator * tamanho);
}

/**
 * Explica a conta em texto, para mostrar na interface.
 * Ajuda o pessoal a entender de onde saiu o número — e a discutir a regra.
 */
export function explicarPontuacao(peixe, pesoGramas, tamanhoCm, ajustes = AJUSTES_PADRAO) {
  if (!peixe) return "";

  if (peixe.modo === "fixa") {
    return `${peixe.nome}: ${peixe.pontosFixos} pontos fixos`;
  }

  const fator = Number(peixe.fator) || 0;
  const peso = (Number(pesoGramas) || 0) * (Number(ajustes.multiplicadorPeso) ?? 1);
  const tamanho = (Number(tamanhoCm) || 0) * (Number(ajustes.multiplicadorTamanho) ?? 1);
  const parcelaPeso = Math.round(fator * peso);
  const parcelaTamanho = Math.round(fator * tamanho);

  return `${fator} × ${formatarNumero(peso)} + ${fator} × ${formatarNumero(tamanho)} = ${parcelaPeso} + ${parcelaTamanho}`;
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
export function montarRanking(pescas, pescadores) {
  const stats = pescadores.map((nome) => {
    const minhas = pescas.filter((p) => p.pescador === nome && !p.removida);
    return {
      nome,
      qtd: minhas.length,
      maior: minhas.reduce((m, p) => Math.max(m, Number(p.tamanho) || 0), 0),
      pesoTotal: minhas.reduce((s, p) => s + (Number(p.pesoGramas) || 0), 0),
      pontos: minhas.reduce((s, p) => s + (Number(p.pontuacao) || 0), 0),
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
