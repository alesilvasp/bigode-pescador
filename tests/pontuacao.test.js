// =========================================================================
//  Testes da regra de pontuação.
//
//  Rodar:  npm test
//
//  O caso âncora é o que o Rodrigo deu no grupo em 06/08/2026. Se este teste
//  quebrar, a regra do campeonato mudou — confirme com ele antes de ajustar
//  o teste, e não o contrário.
// =========================================================================

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { AJUSTES_PADRAO, PEIXES_PADRAO } from "../js/config.js";
import {
  calcularPontuacao,
  explicarPontuacao,
  montarRanking,
  recalcularTodas,
} from "../js/pontuacao.js";

const peixe = (nome) => PEIXES_PADRAO.find((p) => p.nome === nome);

describe("regra oficial do Rodrigo", () => {
  it("robalo de 100 g e 45 cm vale 725 pontos", () => {
    // 5×100 + 5×45 = 500 + 225 = 725
    assert.equal(calcularPontuacao(peixe("Robalo"), 100, 45), 725);
  });

  it("a conta é fator × peso(g) + fator × tamanho(cm)", () => {
    assert.equal(calcularPontuacao({ fator: 3, modo: "formula" }, 200, 30), 3 * 200 + 3 * 30);
  });

  it("arredonda para inteiro", () => {
    assert.equal(calcularPontuacao({ fator: 1.5, modo: "formula" }, 33, 7), Math.round(1.5 * 33 + 1.5 * 7));
  });
});

describe("casos de borda", () => {
  it("baiacu pontua negativo (é penalidade)", () => {
    const p = calcularPontuacao(peixe("Baiacu"), 500, 20);
    assert.ok(p < 0, `esperava negativo, veio ${p}`);
    assert.equal(p, Math.round(-0.5 * 500 + -0.5 * 20));
  });

  it("peixe galo tem fator 10 (troféu)", () => {
    assert.equal(peixe("Peixe Galo").fator, 10);
  });

  it("peixe sem informação vale zero em vez de quebrar", () => {
    assert.equal(calcularPontuacao(null, 100, 45), 0);
    assert.equal(calcularPontuacao(undefined, 100, 45), 0);
  });

  it("peso ou tamanho vazio não vira NaN", () => {
    assert.equal(calcularPontuacao(peixe("Robalo"), NaN, 45), 225);
    assert.equal(calcularPontuacao(peixe("Robalo"), 100, undefined), 500);
    assert.equal(calcularPontuacao(peixe("Robalo"), "", ""), 0);
  });
});

describe("modo de pontuação fixa", () => {
  // Nenhum peixe padrão usa este modo. Ele existe para o grupo cadastrar um
  // peixe assim pela tela de Ajustes, então o teste usa um peixe inventado.
  const fixo = { nome: "Peixe de teste", modo: "fixa", pontosFixos: 120, fator: 0 };

  it("vale sempre o mesmo, independentemente de peso e tamanho", () => {
    assert.equal(calcularPontuacao(fixo, 0, 0), 120);
    assert.equal(calcularPontuacao(fixo, 9999, 99), 120);
  });

  it("nenhum peixe padrão usa pontuação fixa", () => {
    assert.ok(PEIXES_PADRAO.every((p) => p.modo === "formula"));
  });
});

describe("fatores oficiais — cada um tem fonte no grupo", () => {
  // Quem decide é o Rodrigo. Se algum destes quebrar, a regra mudou:
  // confirme com ele antes de mexer no teste.
  const esperado = {
    Robalo: 5, // "Fator de relevância do peixe (robalo - 5 / bagre - 2)"
    Caranha: 5, // "Mesmo peso de caranha e pescada e robalo, concordam?"
    Pescada: 5, // idem
    Traíra: 5, // Alex: "Traíra? 5?" → Rodrigo: "sim sim"
    Bagre: 2, // "robalo - 5 / bagre - 2"
    "Peixe Galo": 10, // "os super trunfo, tipo, peixe galo... colocaria 10 pontos"
    Baiacu: -0.5, // "a coloca baiacu menos 0,5"
  };

  for (const [nome, fator] of Object.entries(esperado)) {
    it(`${nome} tem fator ${fator}`, () => {
      assert.equal(peixe(nome)?.fator, fator);
    });
  }

  it("baiacu é a única penalidade e peixe galo o único troféu", () => {
    assert.deepEqual(
      PEIXES_PADRAO.filter((p) => p.penalidade).map((p) => p.nome),
      ["Baiacu"]
    );
    assert.deepEqual(
      PEIXES_PADRAO.filter((p) => p.trofeu).map((p) => p.nome),
      ["Peixe Galo"]
    );
  });
});

describe("calibragem pelos multiplicadores", () => {
  it("multiplicadores em 1 reproduzem a regra original", () => {
    assert.equal(
      calcularPontuacao(peixe("Robalo"), 100, 45, AJUSTES_PADRAO),
      calcularPontuacao(peixe("Robalo"), 100, 45)
    );
  });

  it("peso em kg: multiplicador 0,001 equilibra a conta", () => {
    // 5×(2000×0.001) + 5×70 = 10 + 350 = 360 — o tamanho passa a dominar
    const p = calcularPontuacao({ fator: 5, modo: "formula" }, 2000, 70, {
      multiplicadorPeso: 0.001,
      multiplicadorTamanho: 1,
    });
    assert.equal(p, 360);
  });

  it("zerar o multiplicador do peso deixa só o tamanho valendo", () => {
    const p = calcularPontuacao({ fator: 5, modo: "formula" }, 5000, 40, {
      multiplicadorPeso: 0,
      multiplicadorTamanho: 1,
    });
    assert.equal(p, 200);
  });
});

describe("o peso domina a fórmula original", () => {
  // Documenta o efeito que o grupo precisa decidir se quer.
  it("num robalo de 2 kg o tamanho vale menos de 4% do total", () => {
    const total = calcularPontuacao(peixe("Robalo"), 2000, 70);
    const soTamanho = 5 * 70;
    assert.equal(total, 10350);
    assert.ok(soTamanho / total < 0.04, `tamanho representa ${((soTamanho / total) * 100).toFixed(1)}%`);
  });
});

describe("ranking", () => {
  const pescadores = ["Ana", "Bruno", "Carla"];
  const pescas = [
    { pescador: "Ana", tamanho: 40, pesoGramas: 1000, pontuacao: 500 },
    { pescador: "Ana", tamanho: 60, pesoGramas: 2000, pontuacao: 800 },
    { pescador: "Bruno", tamanho: 55, pesoGramas: 1500, pontuacao: 1300 },
    { pescador: "Carla", tamanho: 30, pesoGramas: 500, pontuacao: 200, removida: true },
  ];

  it("soma pontos, conta pescas e acha o maior peixe", () => {
    const r = montarRanking(pescas, pescadores);
    const ana = r.find((x) => x.nome === "Ana");
    assert.equal(ana.pontos, 1300);
    assert.equal(ana.qtd, 2);
    assert.equal(ana.maior, 60);
    assert.equal(ana.pesoTotal, 3000);
  });

  it("ignora pescas removidas", () => {
    const carla = montarRanking(pescas, pescadores).find((x) => x.nome === "Carla");
    assert.equal(carla.qtd, 0);
    assert.equal(carla.pontos, 0);
  });

  it("empate em pontos desempata por peso total", () => {
    // Ana e Bruno têm 1300; Ana tem 3000 g contra 1500 g do Bruno.
    const r = montarRanking(pescas, pescadores);
    assert.equal(r[0].nome, "Ana");
    assert.equal(r[1].nome, "Bruno");
  });

  it("quem não pescou fica por último, sem quebrar", () => {
    const r = montarRanking([], pescadores);
    assert.equal(r.length, 3);
    assert.ok(r.every((x) => x.pontos === 0 && x.qtd === 0));
  });
});

describe("recálculo em massa", () => {
  it("aplica o fator novo nas pescas existentes", () => {
    const pescas = [{ id: "1", tipo: "Robalo", fator: 5, pesoGramas: 100, tamanho: 45, pontuacao: 725 }];
    const mapa = new Map([["Robalo", { nome: "Robalo", fator: 10, modo: "formula" }]]);
    const [nova] = recalcularTodas(pescas, mapa, AJUSTES_PADRAO);
    assert.equal(nova.pontuacao, 1450);
    assert.equal(nova.fator, 10);
  });

  it("mantém o objeto original quando nada muda (evita re-render à toa)", () => {
    const pescas = [{ id: "1", tipo: "Robalo", fator: 5, pesoGramas: 100, tamanho: 45, pontuacao: 725 }];
    const mapa = new Map([["Robalo", { nome: "Robalo", fator: 5, modo: "formula" }]]);
    const [nova] = recalcularTodas(pescas, mapa, AJUSTES_PADRAO);
    assert.equal(nova, pescas[0]);
  });

  it("peixe que saiu da lista preserva o snapshot antigo", () => {
    const pescas = [{ id: "1", tipo: "Sumido", fator: 7, pesoGramas: 100, tamanho: 10, pontuacao: 770 }];
    const [nova] = recalcularTodas(pescas, new Map(), AJUSTES_PADRAO);
    assert.equal(nova.pontuacao, 770);
  });
});

describe("explicação da conta", () => {
  it("mostra as duas parcelas", () => {
    assert.equal(explicarPontuacao(peixe("Robalo"), 100, 45), "5 × 100 + 5 × 45 = 500 + 225");
  });

  it("peixe fixo explica que é fixo", () => {
    const fixo = { nome: "Peixe de teste", modo: "fixa", pontosFixos: 50, fator: 0 };
    assert.match(explicarPontuacao(fixo, 0, 0), /50 pontos fixos/);
  });
});
