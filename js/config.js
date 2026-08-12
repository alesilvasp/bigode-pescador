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

// Peixes padrão.
//
// Dois modos de pontuação:
//   "formula" → fator × peso + fator × tamanho   (a regra do campeonato)
//   "fixa"    → pontos fixos, independem de peso e tamanho
//
// Nenhum peixe padrão usa "fixa" hoje. O modo existe para o grupo cadastrar
// um peixe assim pela tela de Ajustes, se um dia quiser.
//
// CADA FATOR TEM FONTE. Quem decide é o Rodrigo; o Alex propôs uma lista em
// 06/08 e o Rodrigo corrigiu. Não alterar sem falar com ele.
//
// A lista cresceu de 8 para 34 com a TABELA OFICIAL DAS ESPÉCIES que o Rodrigo
// mandou no grupo em 12/08/2026 — 32 espécies com nome científico, comprimento
// máximo e faixa de valor por cor. A tabela **não traz número de fator**; traz
// faixas. O mapa abaixo é o que reproduz os quatro fatores que ele já havia
// dado, e é por isso que se acredita nele:
//
//   Alto Valor Esportivo (azul-marinho) → 5   confere com Robalo, Caranha e Traíra
//   Médio Valor          (azul)         → 4   confere com Corvina
//   Bagres e Menor Valor (cinza)        → 2   confere com Bagre
//   Penalidade           (vermelho)     → -0,5  confere com Baiacu
//
// Duas exceções, mantidas porque têm FALA dele e a cor não sobrepõe fala:
//   • Pescada segue 5 ("mesmo peso de caranha e pescada e robalo"), embora a
//     tabela a pinte como Médio Valor, que daria 4.
//   • Peixe Galo segue 10 ("os super trunfo... colocaria 10 pontos"); na tabela
//     ele aparece só como Alto Valor, sem faixa de super trunfo.
// As duas estão no BACKLOG.md esperando confirmação do Rodrigo.
//
// `cientifico` e `tamanhoMaximo` vêm da tabela e ficam SÓ no aparelho: não há
// coluna para eles no banco e os mapeadores do sync não os enviam. Mexer nisso
// exigiria SQL, que só o Alex roda.
//
// "Robalo" e "Bagre" genéricos continuam na lista, além das espécies
// específicas: as pescas já registradas usam esses nomes (a chave do peixe é o
// nome), e na beira do rio ninguém separa Centropomus undecimalis de
// parallelus com o peixe se debatendo na mão.
export const PEIXES_PADRAO = [
  // ---- Alto valor esportivo (fator 5) -------------------------------------
  // "Fator de relevância do peixe (robalo - 5 / bagre - 2)" — Rodrigo, 04:37
  { nome: "Robalo", fator: 5, modo: "formula", cientifico: "Centropomus spp.", tamanhoMaximo: 120 },
  { nome: "Robalo Flecha", fator: 5, modo: "formula", cientifico: "Centropomus undecimalis", tamanhoMaximo: 120 },
  { nome: "Robalo Peva", fator: 5, modo: "formula", cientifico: "Centropomus parallelus", tamanhoMaximo: 100 },
  // "Mesmo peso de caranha e pescada e robalo, concordam?" — Rodrigo, 14:40
  { nome: "Caranha", fator: 5, modo: "formula", cientifico: "Caranx spp.", tamanhoMaximo: 100 },
  // Alex: "Traíra? 5?" → Rodrigo: "sim sim" — 14:40
  { nome: "Traíra", fator: 5, modo: "formula", cientifico: "Hoplias malabaricus", tamanhoMaximo: 70 },
  { nome: "Garoupa", fator: 5, modo: "formula", cientifico: "Epinephelus marginatus", tamanhoMaximo: 150 },
  { nome: "Badejo", fator: 5, modo: "formula", cientifico: "Mycteroperca spp.", tamanhoMaximo: 140 },
  { nome: "Linguado", fator: 5, modo: "formula", cientifico: "Paralichthys spp.", tamanhoMaximo: 100 },
  { nome: "Anchova", fator: 5, modo: "formula", cientifico: "Pomatomus saltatrix", tamanhoMaximo: 120 },
  { nome: "Olhete", fator: 5, modo: "formula", cientifico: "Seriola spp.", tamanhoMaximo: 150 },
  { nome: "Tucunaré", fator: 5, modo: "formula", cientifico: "Cichla spp.", tamanhoMaximo: 100 },

  // ---- Médio valor (fator 4) ---------------------------------------------
  // Confirmado pelo Alex em 11/08/2026 ("acho que corvina tá 4"). Atenção: a
  // tabela que ele mandou em 06/08 dizia 2, e o Rodrigo nunca falou da corvina
  // — então 4 vem do Alex, não da regra original. Ver BACKLOG.md.
  { nome: "Corvina", fator: 4, modo: "formula", cientifico: "Micropogonias furnieri", tamanhoMaximo: 120 },
  { nome: "Xaréu", fator: 4, modo: "formula", cientifico: "Caranx latus", tamanhoMaximo: 120 },
  { nome: "Cioba", fator: 4, modo: "formula", cientifico: "Lutjanus synagris", tamanhoMaximo: 100 },
  { nome: "Bonito", fator: 4, modo: "formula", cientifico: "Sarda sarda", tamanhoMaximo: 100 },
  { nome: "Pescada Amarela", fator: 4, modo: "formula", cientifico: "Cynoscion acoupa", tamanhoMaximo: 120 },
  { nome: "Pampo", fator: 4, modo: "formula", cientifico: "Trachinotus spp.", tamanhoMaximo: 80 },
  { nome: "Vermelho", fator: 4, modo: "formula", cientifico: "Lutjanus buccanella", tamanhoMaximo: 100 },
  { nome: "Serra", fator: 4, modo: "formula", cientifico: "Scomberomorus brasiliensis", tamanhoMaximo: 120 },
  { nome: "Sororoca", fator: 4, modo: "formula", cientifico: "Scomberomorus cavalla", tamanhoMaximo: 120 },
  { nome: "Sargo", fator: 4, modo: "formula", cientifico: "Anisotremus surinamensis", tamanhoMaximo: 60 },
  { nome: "Carapeba", fator: 4, modo: "formula", cientifico: "Eugerres brasilianus", tamanhoMaximo: 50 },
  { nome: "Jundiá", fator: 4, modo: "formula", cientifico: "Rhamdia quelen", tamanhoMaximo: 60 },

  // Exceção: a tabela pinta a Pescada como Médio Valor, mas ele disse que ela
  // vale o mesmo que caranha e robalo. Fala vence cor até ele confirmar.
  { nome: "Pescada", fator: 5, modo: "formula", cientifico: "Cynoscion spp.", tamanhoMaximo: 100 },

  // ---- Bagres e espécies de menor valor (fator 2) -------------------------
  // "bagre - 2" — Rodrigo, 04:37
  { nome: "Bagre", fator: 2, modo: "formula", cientifico: "Bagre spp.", tamanhoMaximo: 80 },
  { nome: "Bagre Bandeira", fator: 2, modo: "formula", cientifico: "Bagre marinus", tamanhoMaximo: 80 },
  { nome: "Bagre Amarelo", fator: 2, modo: "formula", cientifico: "Genidens barbus", tamanhoMaximo: 80 },
  { nome: "Bagre Marinho", fator: 2, modo: "formula", cientifico: "Sciades spp.", tamanhoMaximo: 70 },
  { nome: "Bagre Branco", fator: 2, modo: "formula", cientifico: "Arius spp.", tamanhoMaximo: 80 },
  { nome: "Mandi", fator: 2, modo: "formula", cientifico: "Genidens genidens", tamanhoMaximo: 70 },
  { nome: "Tainha", fator: 2, modo: "formula", cientifico: "Mugil liza", tamanhoMaximo: 90 },
  { nome: "Parati", fator: 2, modo: "formula", cientifico: "Mugil curema", tamanhoMaximo: 50 },

  // ---- Troféu e penalidade -----------------------------------------------
  // "tem os super trunfo, tipo, peixe galo... colocaria 10 pontos" — Rodrigo, 14:44
  // É o "GALO" (Selene vomer) da tabela; mantém o nome antigo porque é a chave
  // das pescas já registradas.
  { nome: "Peixe Galo", fator: 10, modo: "formula", trofeu: true, cientifico: "Selene vomer", tamanhoMaximo: 70 },
  // "a coloca baiacu menos 0,5" — Rodrigo, 14:40
  { nome: "Baiacu", fator: -0.5, modo: "formula", penalidade: true, cientifico: "Sphoeroides spp.", tamanhoMaximo: 40 },
];

// Multiplicadores da fórmula. Com ambos em 1 a conta é exatamente a regra
// original do Rodrigo: fator × peso(g) + fator × tamanho(cm).
// Ficam editáveis na tela de Ajustes para o grupo calibrar sem mexer no código.
export const AJUSTES_PADRAO = {
  multiplicadorPeso: 1, // aplicado sobre o peso em GRAMAS
  multiplicadorTamanho: 1, // aplicado sobre o tamanho em CM
  unidadePesoPadrao: "kg", // "kg" | "g"
  tamanhoMaximo: 100, // limite do slider, em cm
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
