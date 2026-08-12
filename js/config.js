// =========================================================================
//  Configuração — constantes e valores padrão do app.
// =========================================================================

export const VERSAO_APP = "2.0.0";

// Pescadores do campeonato. Editáveis pela tela de Ajustes.
export const PESCADORES_PADRAO = [
  "Luis Fellipe",
  "Felipe Felix",
  "Rodrigo Massi",
  "Alex Sakaki",
];

// =========================================================================
//  Peixes padrão — a tabela oficial das espécies.
// =========================================================================
//
// Dois modos de pontuação:
//   "formula" → pontos da espécie + comprimento(cm) + peso(g)÷100
//   "fixa"    → vale sempre `pontosFixos`, ignorando peso e tamanho
//
// ⚠️ O campo `fator` guarda os PONTOS DA ESPÉCIE. O nome ficou de quando a
// regra era `fator × peso + fator × tamanho`; renomear para `pontosEspecie`
// exigiria coluna nova no banco, e SQL só o Alex roda. A escala mudou de
// unidades (5, 4, 2) para centenas (300, 200, 100) em 12/08/2026 — é
// `ESCALA_ANTIGA`, no fim deste bloco, que permite migrar quem ficou atrás.
//
// CADA VALOR TEM FONTE. Quem decide é o Rodrigo. Não alterar sem falar com ele.
//
// A lista tem 34 peixes: as 32 da TABELA OFICIAL DAS ESPÉCIES que ele mandou no
// grupo em 12/08/2026, mais "Robalo" e "Bagre" genéricos. Os genéricos ficam
// porque a chave do peixe é o NOME e as pescas já registradas usam esses nomes
// — renomear deixaria o histórico órfão. E na beira do rio ninguém separa
// Centropomus undecimalis de parallelus com o peixe se debatendo na mão.
//
// De onde vêm os pontos: a tabela **não traz** o valor de cada espécie. Traz
// faixas por cor, e UMA âncora oficial no exemplo de cálculo — "Robalo Flecha"
// vale 300. O resto da escala é proporção derivada dessas faixas e o Rodrigo
// ainda não confirmou (ver BACKLOG.md). É por isso que o valor é editável na
// tela de Ajustes: o grupo calibra sem esperar release.
//
//   Alto Valor Esportivo (azul-marinho) → 300  ÂNCORA OFICIAL (robalo flecha)
//   Médio Valor          (azul)         → 200  derivado
//   Valor Padrão         (azul claro)   → 100  derivado. O Alex confirmou em
//                                              12/08 que são os cards 19 a 23
//   Bagres e Menor Valor (cinza)        →  50  derivado
//   Penalidade           (vermelho)     → -100 OFICIAL, fixo, por exemplar
//
// Duas exceções de propósito, porque FALA do Rodrigo vence cor de tabela:
//   • Pescada vale 300, igual a caranha e robalo — "mesmo peso de caranha e
//     pescada e robalo" —, embora a cor a coloque em Valor Padrão.
//   • Peixe Galo é o "super trunfo": valia o DOBRO do robalo (10 contra 5) e
//     mantém a proporção, 600. A tabela não tem faixa de super trunfo.
// As duas estão no BACKLOG.md esperando confirmação.
//
// `cientifico` e `tamanhoMaximo` vêm da tabela e ficam SÓ no aparelho: não há
// coluna para eles no banco e os mapeadores do sync não os enviam.
export const PEIXES_PADRAO = [
  // ---- Alto valor esportivo — 300 pontos ---------------------------------
  // "Fator de relevância do peixe (robalo - 5 / bagre - 2)" — Rodrigo, 04:37
  { nome: "Robalo", fator: 300, modo: "formula", cientifico: "Centropomus spp.", tamanhoMaximo: 120 },
  { nome: "Robalo Flecha", fator: 300, modo: "formula", cientifico: "Centropomus undecimalis", tamanhoMaximo: 120 },
  { nome: "Robalo Peva", fator: 300, modo: "formula", cientifico: "Centropomus parallelus", tamanhoMaximo: 100 },
  // "Mesmo peso de caranha e pescada e robalo, concordam?" — Rodrigo, 14:40
  { nome: "Caranha", fator: 300, modo: "formula", cientifico: "Caranx spp.", tamanhoMaximo: 100 },
  // Mesma fala: a Pescada acompanha caranha e robalo, contra a cor da tabela.
  { nome: "Pescada", fator: 300, modo: "formula", cientifico: "Cynoscion spp.", tamanhoMaximo: 100 },
  // Alex: "Traíra? 5?" → Rodrigo: "sim sim" — 14:40
  { nome: "Traíra", fator: 300, modo: "formula", cientifico: "Hoplias malabaricus", tamanhoMaximo: 70 },
  { nome: "Garoupa", fator: 300, modo: "formula", cientifico: "Epinephelus marginatus", tamanhoMaximo: 150 },
  { nome: "Badejo", fator: 300, modo: "formula", cientifico: "Mycteroperca spp.", tamanhoMaximo: 140 },
  { nome: "Linguado", fator: 300, modo: "formula", cientifico: "Paralichthys spp.", tamanhoMaximo: 100 },
  { nome: "Anchova", fator: 300, modo: "formula", cientifico: "Pomatomus saltatrix", tamanhoMaximo: 120 },
  { nome: "Olhete", fator: 300, modo: "formula", cientifico: "Seriola spp.", tamanhoMaximo: 150 },
  { nome: "Tucunaré", fator: 300, modo: "formula", cientifico: "Cichla spp.", tamanhoMaximo: 100 },

  // ---- Médio valor — 200 pontos ------------------------------------------
  { nome: "Xaréu", fator: 200, modo: "formula", cientifico: "Caranx latus", tamanhoMaximo: 120 },
  { nome: "Cioba", fator: 200, modo: "formula", cientifico: "Lutjanus synagris", tamanhoMaximo: 100 },
  { nome: "Bonito", fator: 200, modo: "formula", cientifico: "Sarda sarda", tamanhoMaximo: 100 },
  { nome: "Pescada Amarela", fator: 200, modo: "formula", cientifico: "Cynoscion acoupa", tamanhoMaximo: 120 },
  { nome: "Pampo", fator: 200, modo: "formula", cientifico: "Trachinotus spp.", tamanhoMaximo: 80 },
  { nome: "Vermelho", fator: 200, modo: "formula", cientifico: "Lutjanus buccanella", tamanhoMaximo: 100 },
  { nome: "Serra", fator: 200, modo: "formula", cientifico: "Scomberomorus brasiliensis", tamanhoMaximo: 120 },
  { nome: "Jundiá", fator: 200, modo: "formula", cientifico: "Rhamdia quelen", tamanhoMaximo: 60 },

  // ---- Valor padrão — 100 pontos (cards 19 a 23, confirmados pelo Alex) ---
  { nome: "Sororoca", fator: 100, modo: "formula", cientifico: "Scomberomorus cavalla", tamanhoMaximo: 120 },
  // A Corvina já era o valor mais baixo entre os "de peixe bom" — o 4 vinha do
  // Alex em 11/08, não do Rodrigo. A cor da tabela concorda: Valor Padrão.
  { nome: "Corvina", fator: 100, modo: "formula", cientifico: "Micropogonias furnieri", tamanhoMaximo: 120 },
  { nome: "Sargo", fator: 100, modo: "formula", cientifico: "Anisotremus surinamensis", tamanhoMaximo: 60 },
  { nome: "Carapeba", fator: 100, modo: "formula", cientifico: "Eugerres brasilianus", tamanhoMaximo: 50 },

  // ---- Bagres e espécies de menor valor — 50 pontos ----------------------
  // "bagre - 2" — Rodrigo, 04:37
  { nome: "Bagre", fator: 50, modo: "formula", cientifico: "Bagre spp.", tamanhoMaximo: 80 },
  { nome: "Bagre Bandeira", fator: 50, modo: "formula", cientifico: "Bagre marinus", tamanhoMaximo: 80 },
  { nome: "Bagre Amarelo", fator: 50, modo: "formula", cientifico: "Genidens barbus", tamanhoMaximo: 80 },
  { nome: "Bagre Marinho", fator: 50, modo: "formula", cientifico: "Sciades spp.", tamanhoMaximo: 70 },
  { nome: "Bagre Branco", fator: 50, modo: "formula", cientifico: "Arius spp.", tamanhoMaximo: 80 },
  { nome: "Mandi", fator: 50, modo: "formula", cientifico: "Genidens genidens", tamanhoMaximo: 70 },
  { nome: "Tainha", fator: 50, modo: "formula", cientifico: "Mugil liza", tamanhoMaximo: 90 },
  { nome: "Parati", fator: 50, modo: "formula", cientifico: "Mugil curema", tamanhoMaximo: 50 },

  // ---- Troféu ------------------------------------------------------------
  // "tem os super trunfo, tipo, peixe galo... colocaria 10 pontos" — Rodrigo,
  // 14:44. É o "GALO" (Selene vomer) da tabela; mantém o nome antigo porque é
  // a chave das pescas já registradas.
  { nome: "Peixe Galo", fator: 600, modo: "formula", trofeu: true, cientifico: "Selene vomer", tamanhoMaximo: 70 },

  // ---- Penalidade --------------------------------------------------------
  // "Cada exemplar de baiacu capturado resultará em -100 PONTOS" — tabela
  // oficial, 12/08/2026. Vira pontuação FIXA: não depende mais de peso nem de
  // tamanho, e por isso esses campos somem do formulário ao escolher baiacu.
  // Antes era -0,5 × peso ("a coloca baiacu menos 0,5" — Rodrigo, 14:40).
  { nome: "Baiacu", fator: -100, modo: "fixa", pontosFixos: -100, penalidade: true, cientifico: "Sphoeroides spp.", tamanhoMaximo: 40 },
];

/**
 * Pontos que cada espécie tinha na escala ANTIGA (`fator × peso + fator ×
 * tamanho`), até a fórmula nova de 12/08/2026.
 *
 * Serve só para migrar, e cobre as 34 espécies porque há DOIS jeitos de um
 * aparelho estar com valor velho:
 *
 *   1. O banco do grupo guarda os 8 originais (Robalo 5, Bagre 2…), e registro
 *      do servidor vence padrão semeado local.
 *   2. Quem abriu a **v2.4.0** — publicada uma hora antes da fórmula nova, no
 *      mesmo dia — semeou as 26 espécies novas já com a escala velha (Robalo
 *      Flecha 5, Sororoca 4…). Esse caso passou batido no primeiro teste: o
 *      simulador mostrava 415 certo e o FORMULÁRIO calculava
 *      `5 + 72 + 43 = 120` para o mesmo peixe.
 *
 * A migração troca **apenas** quem está exatamente nesses números — fator que o
 * grupo editou na tela é decisão deles e fica de pé.
 */
export const ESCALA_ANTIGA = {
  // alto valor esportivo valia 5
  Robalo: 5,
  "Robalo Flecha": 5,
  "Robalo Peva": 5,
  Caranha: 5,
  Pescada: 5,
  Traíra: 5,
  Garoupa: 5,
  Badejo: 5,
  Linguado: 5,
  Anchova: 5,
  Olhete: 5,
  Tucunaré: 5,
  // médio valor valia 4 — a faixa "padrão" só existiu depois, com a resposta
  // do Alex sobre os cards 19 a 23
  Corvina: 4,
  Xaréu: 4,
  Cioba: 4,
  Bonito: 4,
  "Pescada Amarela": 4,
  Pampo: 4,
  Vermelho: 4,
  Serra: 4,
  Sororoca: 4,
  Sargo: 4,
  Carapeba: 4,
  Jundiá: 4,
  // bagres e menor valor valiam 2
  Bagre: 2,
  "Bagre Bandeira": 2,
  "Bagre Amarelo": 2,
  "Bagre Marinho": 2,
  "Bagre Branco": 2,
  Mandi: 2,
  Tainha: 2,
  Parati: 2,
  // troféu e penalidade
  "Peixe Galo": 10,
  Baiacu: -0.5,
};

// Calibragem da fórmula oficial. Com os multiplicadores em 1, a conta é
// exatamente a da tabela do Rodrigo:
//
//     pontos da espécie + comprimento(cm) + peso(g)÷100
//
// Ficam editáveis na tela de Ajustes para o grupo calibrar sem mexer no código
// — foi assim que se resolveu a discussão do peso dominar a conta antiga.
export const AJUSTES_PADRAO = {
  multiplicadorTamanho: 1, // aplicado sobre o comprimento em CM
  multiplicadorPeso: 1, // aplicado sobre peso(g)÷100
  divisorPeso: 100, // "PESO (g) ÷ 100", da fórmula oficial
  bonusEspecies: 300, // "+300 PONTOS" por 5 espécies diferentes
  especiesParaBonus: 5, // "CINCO ESPÉCIES DIFERENTES"
  unidadePesoPadrao: "kg", // "kg" | "g"
  tamanhoMaximo: 100, // limite do slider quando a espécie não tem o dela
};

export const OPCAO_NOVO = "__novo__"; // valor especial no select de peixe

// Chaves do localStorage (metadados leves; o volume vai para o IndexedDB).
export const CHAVES = {
  eu: "bigode-pescador:eu", // qual pescador está usando este aparelho
  etapaAtual: "bigode-pescador:etapa-atual",
  ajustes: "bigode-pescador:ajustes",
  pescadores: "bigode-pescador:pescadores",
  supabase: "bigode-pescador:supabase", // { url, anonKey } opcional
  migrado: "bigode-pescador:migrado-v2",
  // Migração da escala de pontos. A chave tem versão porque a primeira rodada
  // cobria só os 8 peixes originais e deixou as 26 espécies novas na escala
  // velha; trocar a chave faz a migração rodar de novo em quem já tinha aberto.
  escalaPontos: "bigode-pescador:escala-pontos-v2",
  conviteInstalar: "bigode-pescador:convite-instalar", // quando dispensaram o convite
  jaEnsinouInstalar: "bigode-pescador:ja-ensinou-instalar",
  // chaves da v1, lidas uma única vez na migração
  v1Pescas: "bigode-pescador:pescas",
  v1PeixesExtra: "bigode-pescador:peixes-extra",
};

// Gera um id curto, ordenável por tempo de criação.
export function novoId(prefixo) {
  return `${prefixo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
