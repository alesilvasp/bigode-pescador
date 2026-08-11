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
// CADA FATOR ABAIXO TEM FONTE. Quem decide é o Rodrigo; o Alex propôs uma
// lista em 06/08 e o Rodrigo corrigiu. Não alterar sem falar com ele.
export const PEIXES_PADRAO = [
  // "Fator de relevância do peixe (robalo - 5 / bagre - 2)" — Rodrigo, 04:37
  { nome: "Robalo", fator: 5, modo: "formula" },
  // "Mesmo peso de caranha e pescada e robalo, concordam?" — Rodrigo, 14:40
  { nome: "Caranha", fator: 5, modo: "formula" },
  { nome: "Pescada", fator: 5, modo: "formula" },
  // Alex: "Traíra? 5?" → Rodrigo: "sim sim" — 14:40
  { nome: "Traíra", fator: 5, modo: "formula" },
  // ⚠️ SEM CONFIRMAÇÃO DO RODRIGO. O Alex propôs 2 numa lista que o Rodrigo
  // corrigiu inteira para cima, mas nunca falou da corvina. Ver BACKLOG.md.
  { nome: "Corvina", fator: 4, modo: "formula" },
  // "bagre - 2" — Rodrigo, 04:37
  { nome: "Bagre", fator: 2, modo: "formula" },
  // "tem os super trunfo, tipo, peixe galo... colocaria 10 pontos" — Rodrigo, 14:44
  { nome: "Peixe Galo", fator: 10, modo: "formula", trofeu: true },
  // "a coloca baiacu menos 0,5" — Rodrigo, 14:40
  { nome: "Baiacu", fator: -0.5, modo: "formula", penalidade: true },
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
  // chaves da v1, lidas uma única vez na migração
  v1Pescas: "bigode-pescador:pescas",
  v1PeixesExtra: "bigode-pescador:peixes-extra",
};

// Gera um id curto, ordenável por tempo de criação.
export function novoId(prefixo) {
  return `${prefixo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
