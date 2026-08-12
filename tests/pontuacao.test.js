// =========================================================================
//  Testes da regra de pontuação.
//
//  Rodar:  npm test
//
//  O caso âncora é o EXEMPLO DE CÁLCULO da tabela oficial que o Rodrigo mandou
//  no grupo em 12/08/2026. Se este teste quebrar, a regra do campeonato mudou —
//  confirme com ele antes de ajustar o teste, e não o contrário.
// =========================================================================

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { AJUSTES_PADRAO, ESCALA_ANTIGA, PEIXES_PADRAO } from "../js/config.js";
import {
  calcularPontuacao,
  campeaoDaEtapa,
  conferirPescaRecebida,
  contarTitulos,
  etapasComResultado,
  explicarPontuacao,
  migrarPeixeDeEscala,
  montarRanking,
  recalcularTodas,
} from "../js/pontuacao.js";

const peixe = (nome) => PEIXES_PADRAO.find((p) => p.nome === nome);

describe("fórmula oficial do Rodrigo", () => {
  it("Robalo Flecha de 72 cm e 4.300 g vale 415 pontos", () => {
    // O exemplo impresso na tabela: 300 + 72 + 43 = 415
    assert.equal(calcularPontuacao(peixe("Robalo Flecha"), 4300, 72), 415);
  });

  it("a conta é pontos da espécie + comprimento(cm) + peso(g)÷100", () => {
    assert.equal(calcularPontuacao({ fator: 200, modo: "formula" }, 1000, 40), 200 + 40 + 10);
  });

  it("arredonda para inteiro", () => {
    // 100 + 33 + 4,44 = 137,44
    assert.equal(calcularPontuacao({ fator: 100, modo: "formula" }, 444, 33), 137);
  });

  it("peixe sem peso nem tamanho vale os pontos da espécie", () => {
    assert.equal(calcularPontuacao({ fator: 300, modo: "formula" }, 0, 0), 300);
  });
});

describe("casos de borda", () => {
  it("peixe sem informação vale zero em vez de quebrar", () => {
    assert.equal(calcularPontuacao(null, 100, 45), 0);
    assert.equal(calcularPontuacao(undefined, 100, 45), 0);
  });

  it("peso ou tamanho vazio não vira NaN", () => {
    assert.equal(calcularPontuacao(peixe("Robalo"), NaN, 45), 345); // 300 + 45 + 0
    assert.equal(calcularPontuacao(peixe("Robalo"), 100, undefined), 301); // 300 + 0 + 1
    assert.equal(calcularPontuacao(peixe("Robalo"), "", ""), 300);
  });

  it("divisor de peso zerado não estoura para infinito", () => {
    const p = calcularPontuacao({ fator: 100, modo: "formula" }, 500, 10, {
      ...AJUSTES_PADRAO,
      divisorPeso: 0,
    });
    assert.ok(Number.isFinite(p), `esperava número finito, veio ${p}`);
  });
});

describe("penalidade do baiacu", () => {
  it("vale -100 fixo, não importa o tamanho do bicho", () => {
    // "Cada exemplar de baiacu capturado resultará em -100 PONTOS"
    assert.equal(calcularPontuacao(peixe("Baiacu"), 500, 20), -100);
    assert.equal(calcularPontuacao(peixe("Baiacu"), 0, 0), -100);
    assert.equal(calcularPontuacao(peixe("Baiacu"), 9999, 40), -100);
  });

  it("é o único peixe padrão de pontuação fixa", () => {
    assert.deepEqual(
      PEIXES_PADRAO.filter((p) => p.modo === "fixa").map((p) => p.nome),
      ["Baiacu"]
    );
  });

  it("é a única penalidade, e o peixe galo o único troféu", () => {
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

describe("bônus de cinco espécies diferentes", () => {
  const pescadores = ["Ana", "Bruno"];
  const pesca = (pescador, tipo, etapaId = "e1", pontuacao = 100) => ({
    pescador,
    tipo,
    etapaId,
    pontuacao,
    pesoGramas: 100,
    tamanho: 10,
  });

  it("cinco espécies na mesma etapa dão +300", () => {
    const pescas = ["Robalo", "Bagre", "Corvina", "Tainha", "Pampo"].map((t) => pesca("Ana", t));
    const ana = montarRanking(pescas, pescadores).find((r) => r.nome === "Ana");
    assert.equal(ana.especies, 5);
    assert.equal(ana.bonus, 300);
    assert.equal(ana.pontosBase, 500);
    assert.equal(ana.pontos, 800);
  });

  it("quatro espécies não dão bônus", () => {
    const pescas = ["Robalo", "Bagre", "Corvina", "Tainha"].map((t) => pesca("Ana", t));
    const ana = montarRanking(pescas, pescadores).find((r) => r.nome === "Ana");
    assert.equal(ana.bonus, 0);
    assert.equal(ana.pontos, 400);
  });

  it("repetir a mesma espécie não conta como espécie nova", () => {
    const pescas = ["Robalo", "Robalo", "Robalo", "Robalo", "Robalo"].map((t) => pesca("Ana", t));
    const ana = montarRanking(pescas, pescadores).find((r) => r.nome === "Ana");
    assert.equal(ana.especies, 1);
    assert.equal(ana.bonus, 0);
  });

  it("cinco espécies espalhadas em duas etapas não dão bônus", () => {
    // 3 numa etapa + 2 na outra: não fechou cinco em nenhuma competição.
    const pescas = [
      pesca("Ana", "Robalo", "e1"),
      pesca("Ana", "Bagre", "e1"),
      pesca("Ana", "Corvina", "e1"),
      pesca("Ana", "Tainha", "e2"),
      pesca("Ana", "Pampo", "e2"),
    ];
    const ana = montarRanking(pescas, pescadores).find((r) => r.nome === "Ana");
    assert.equal(ana.especies, 5, "cinco espécies distintas no total");
    assert.equal(ana.bonus, 0, "mas nenhuma etapa com cinco");
  });

  it("no geral, soma um bônus por etapa que fechou cinco", () => {
    const cinco = (etapa) =>
      ["Robalo", "Bagre", "Corvina", "Tainha", "Pampo"].map((t) => pesca("Ana", t, etapa));
    const ana = montarRanking([...cinco("e1"), ...cinco("e2")], pescadores).find((r) => r.nome === "Ana");
    assert.equal(ana.etapasComBonus, 2);
    assert.equal(ana.bonus, 600);
  });

  it("o valor e o mínimo do bônus são calibráveis", () => {
    const pescas = ["Robalo", "Bagre"].map((t) => pesca("Ana", t));
    const ana = montarRanking(pescas, pescadores, {
      ...AJUSTES_PADRAO,
      especiesParaBonus: 2,
      bonusEspecies: 50,
    }).find((r) => r.nome === "Ana");
    assert.equal(ana.bonus, 50);
  });
});

describe("pontos das espécies — tabela oficial de 12/08/2026", () => {
  const porNome = new Map(PEIXES_PADRAO.map((p) => [p.nome, p]));

  it("tem as 34 espécies da lista", () => {
    assert.equal(PEIXES_PADRAO.length, 34);
  });

  it("nome de peixe não repete — o nome é a chave no banco", () => {
    assert.equal(new Set(PEIXES_PADRAO.map((p) => p.nome)).size, PEIXES_PADRAO.length);
  });

  it("os 8 nomes originais continuam existindo", () => {
    // A chave do peixe é o nome, e as pescas já registradas guardam esse nome.
    // Renomear "Robalo" para "Robalo Flecha" deixaria o histórico órfão.
    for (const nome of ["Robalo", "Caranha", "Pescada", "Traíra", "Corvina", "Bagre", "Peixe Galo", "Baiacu"]) {
      assert.ok(porNome.has(nome), `faltou ${nome}`);
    }
  });

  it("alto valor esportivo vale 300 — âncora oficial do robalo flecha", () => {
    for (const nome of ["Robalo", "Robalo Flecha", "Robalo Peva", "Caranha", "Traíra",
                        "Garoupa", "Badejo", "Linguado", "Anchova", "Olhete", "Tucunaré"]) {
      assert.equal(porNome.get(nome)?.fator, 300, nome);
    }
  });

  it("médio valor vale 200", () => {
    for (const nome of ["Xaréu", "Cioba", "Bonito", "Pescada Amarela", "Pampo",
                        "Vermelho", "Serra", "Jundiá"]) {
      assert.equal(porNome.get(nome)?.fator, 200, nome);
    }
  });

  it("valor padrão vale 100 — cards 19 a 23, confirmados pelo Alex", () => {
    for (const nome of ["Sororoca", "Corvina", "Sargo", "Carapeba"]) {
      assert.equal(porNome.get(nome)?.fator, 100, nome);
    }
  });

  it("bagres e menor valor valem 50", () => {
    for (const nome of ["Bagre", "Bagre Bandeira", "Bagre Amarelo", "Bagre Marinho",
                        "Bagre Branco", "Mandi", "Tainha", "Parati"]) {
      assert.equal(porNome.get(nome)?.fator, 50, nome);
    }
  });

  it("Pescada acompanha caranha e robalo — fala do Rodrigo vence a cor", () => {
    // "mesmo peso de caranha e pescada e robalo". A cor da tabela a coloca em
    // Valor Padrão (100); até ele confirmar, vale o que ele falou.
    assert.equal(porNome.get("Pescada").fator, 300);
    assert.equal(porNome.get("Pescada").fator, porNome.get("Caranha").fator);
  });

  it("Peixe Galo é o super trunfo: o dobro do robalo", () => {
    assert.equal(porNome.get("Peixe Galo").fator, 600);
    assert.equal(porNome.get("Peixe Galo").fator, porNome.get("Robalo").fator * 2);
  });

  it("toda espécie tem nome científico e comprimento máximo", () => {
    for (const p of PEIXES_PADRAO) {
      assert.ok(p.cientifico?.length > 3, `${p.nome} sem científico`);
      assert.ok(p.tamanhoMaximo >= 40 && p.tamanhoMaximo <= 150, `${p.nome}: ${p.tamanhoMaximo}`);
    }
  });

  it("o comprimento máximo é o da tabela, por espécie", () => {
    assert.equal(porNome.get("Garoupa").tamanhoMaximo, 150);
    assert.equal(porNome.get("Badejo").tamanhoMaximo, 140);
    assert.equal(porNome.get("Carapeba").tamanhoMaximo, 50);
    assert.equal(porNome.get("Baiacu").tamanhoMaximo, 40);
  });
});

describe("pesca que chega do sync é conferida pela régua local", () => {
  // Cenário real da virada de fórmula: quem não atualizou o app calcula pela
  // regra velha com os pontos novos que já estão no banco.
  it("corrige pontuação absurda vinda de aparelho na versão antiga", () => {
    const daRede = { tipo: "Robalo", pesoGramas: 1000, tamanho: 50, pontuacao: 315000, fator: 300 };
    const c = conferirPescaRecebida(daRede, peixe("Robalo"));
    assert.equal(c.pontuacao, 360); // 300 + 50 + 10
  });

  it("peixe que este aparelho não conhece mantém o número original", () => {
    // Recalcular sem a espécie na lista daria zero e apagaria a pesca do placar.
    const daRede = { tipo: "Dourado", pesoGramas: 1000, tamanho: 50, pontuacao: 777, fator: 9 };
    assert.equal(conferirPescaRecebida(daRede, null), null);
  });

  it("pesca já correta não é reescrita — evita gravação à toa", () => {
    const daRede = { tipo: "Robalo", pesoGramas: 1000, tamanho: 50, pontuacao: 360, fator: 300 };
    assert.equal(conferirPescaRecebida(daRede, peixe("Robalo")), null);
  });

  it("respeita a calibragem deste aparelho", () => {
    const daRede = { tipo: "Robalo", pesoGramas: 1000, tamanho: 50, pontuacao: 360, fator: 300 };
    const c = conferirPescaRecebida(daRede, peixe("Robalo"), { ...AJUSTES_PADRAO, multiplicadorPeso: 0 });
    assert.equal(c.pontuacao, 350); // 300 + 50 + 0
  });
});

describe("escala antiga, usada só para migrar", () => {
  it("guarda os valores que o banco do grupo ainda tem", () => {
    // Sem isso, o sync devolve fator 5 para o Robalo e um peixe de 1,5 kg vale
    // 5 + 51 + 15 = 71 pontos em vez de 366.
    assert.equal(ESCALA_ANTIGA["Robalo"], 5);
    assert.equal(ESCALA_ANTIGA["Bagre"], 2);
    assert.equal(ESCALA_ANTIGA["Peixe Galo"], 10);
    assert.equal(ESCALA_ANTIGA["Baiacu"], -0.5);
  });

  it("cobre TODAS as espécies padrão, não só as 8 originais", () => {
    // Foi exatamente esta falha em produção: a v2.4.0 semeou as 26 espécies
    // novas já na escala velha (Robalo Flecha 5, Sororoca 4…), a migração só
    // conhecia os 8 nomes antigos e o formulário passou a calcular
    // `5 + 72 + 43 = 120` para um robalo que devia dar 415. O simulador, que
    // usa valor fixo, mostrava 415 e escondia o problema.
    const semEscala = PEIXES_PADRAO.filter((p) => ESCALA_ANTIGA[p.nome] === undefined);
    assert.deepEqual(semEscala.map((p) => p.nome), [], "espécies fora da migração");
  });

  it("a escala antiga da v2.4.0 está completa nas três faixas", () => {
    assert.equal(ESCALA_ANTIGA["Robalo Flecha"], 5);
    assert.equal(ESCALA_ANTIGA["Sororoca"], 4); // era médio; virou padrão depois
    assert.equal(ESCALA_ANTIGA["Tainha"], 2);
  });

  describe("decisão de migrar cada peixe", () => {
    const padrao = (nome) => PEIXES_PADRAO.find((p) => p.nome === nome);

    it("peixe no valor antigo migra para os pontos novos", () => {
      const local = { nome: "Robalo Flecha", fator: 5, modo: "formula" };
      const troca = migrarPeixeDeEscala(local, padrao("Robalo Flecha"), ESCALA_ANTIGA);
      assert.equal(troca.fator, 300);
      assert.equal(troca.modo, "formula");
    });

    it("todas as 34 espécies migram, vindas da v2.4.0", () => {
      // Este é o caso que escapou: as espécies novas tinham sido semeadas na
      // escala velha e ficaram de fora da primeira migração.
      for (const p of PEIXES_PADRAO) {
        const local = { nome: p.nome, fator: ESCALA_ANTIGA[p.nome], modo: "formula" };
        const troca = migrarPeixeDeEscala(local, p, ESCALA_ANTIGA);
        assert.ok(troca, `${p.nome} não migraria`);
        assert.equal(troca.fator, p.fator, p.nome);
      }
    });

    it("baiacu migra para pontuação fixa de -100", () => {
      const local = { nome: "Baiacu", fator: -0.5, modo: "formula", pontosFixos: 0 };
      const troca = migrarPeixeDeEscala(local, padrao("Baiacu"), ESCALA_ANTIGA);
      assert.equal(troca.modo, "fixa");
      assert.equal(troca.pontosFixos, -100);
    });

    it("fator editado pelo grupo NÃO é sobrescrito", () => {
      const local = { nome: "Robalo", fator: 7, modo: "formula" }; // 7 não é o antigo
      assert.equal(migrarPeixeDeEscala(local, padrao("Robalo"), ESCALA_ANTIGA), null);
    });

    it("peixe já na escala nova fica como está", () => {
      const local = { nome: "Robalo", fator: 300, modo: "formula" };
      assert.equal(migrarPeixeDeEscala(local, padrao("Robalo"), ESCALA_ANTIGA), null);
    });

    it("peixe cadastrado pelo grupo, fora da tabela, não é tocado", () => {
      const local = { nome: "Dourado", fator: 5, modo: "formula" };
      assert.equal(migrarPeixeDeEscala(local, { nome: "Dourado", fator: 5 }, ESCALA_ANTIGA), null);
    });
  });

  it("nenhum valor da escala antiga sobrou na lista de peixes", () => {
    for (const [nome, antigo] of Object.entries(ESCALA_ANTIGA)) {
      const atual = PEIXES_PADRAO.find((p) => p.nome === nome);
      assert.notEqual(atual.fator, antigo, `${nome} ficou no valor antigo (${antigo})`);
    }
  });
});

describe("calibragem pelos multiplicadores", () => {
  it("multiplicadores em 1 reproduzem a regra oficial", () => {
    assert.equal(
      calcularPontuacao(peixe("Robalo Flecha"), 4300, 72, AJUSTES_PADRAO),
      calcularPontuacao(peixe("Robalo Flecha"), 4300, 72)
    );
  });

  it("dobrar o multiplicador do comprimento só mexe nessa parcela", () => {
    // 300 + (72×2) + 43 = 487
    const p = calcularPontuacao(peixe("Robalo Flecha"), 4300, 72, {
      ...AJUSTES_PADRAO,
      multiplicadorTamanho: 2,
    });
    assert.equal(p, 487);
  });

  it("zerar o multiplicador do peso deixa espécie + comprimento", () => {
    const p = calcularPontuacao(peixe("Robalo Flecha"), 4300, 72, {
      ...AJUSTES_PADRAO,
      multiplicadorPeso: 0,
    });
    assert.equal(p, 372);
  });
});

describe("a fórmula nova equilibra peso e comprimento", () => {
  // A regra antiga (`fator × peso + fator × tamanho`) fazia o peso ser 98% da
  // nota, e o Alex apontou isso no grupo: um peixe curto e gordo ganhava de um
  // robalo comprido. Este teste existe para o equilíbrio não se perder de novo.
  it("no robalo de 4,3 kg da tabela, o peso é ~10% do total", () => {
    const total = calcularPontuacao(peixe("Robalo Flecha"), 4300, 72);
    const soPeso = 4300 / 100;
    assert.equal(total, 415);
    assert.ok(soPeso / total < 0.12, `peso representa ${((soPeso / total) * 100).toFixed(0)}%`);
  });

  it("o comprimento pesa mais que o peso", () => {
    const total = calcularPontuacao(peixe("Robalo Flecha"), 4300, 72);
    assert.ok(72 / total > 4300 / 100 / total);
  });

  it("um robalo comprido e leve ganha de um curto e gordo", () => {
    const comprido = calcularPontuacao(peixe("Robalo"), 800, 70);
    const gordo = calcularPontuacao(peixe("Robalo"), 3000, 40);
    assert.ok(comprido > gordo, `comprido ${comprido} deveria passar o gordo ${gordo}`);
  });
});

describe("ranking", () => {
  const pescadores = ["Ana", "Bruno", "Carla"];
  const pescas = [
    { pescador: "Ana", tipo: "Robalo", etapaId: "e1", tamanho: 40, pesoGramas: 1000, pontuacao: 500 },
    { pescador: "Ana", tipo: "Bagre", etapaId: "e1", tamanho: 60, pesoGramas: 2000, pontuacao: 800 },
    { pescador: "Bruno", tipo: "Robalo", etapaId: "e1", tamanho: 55, pesoGramas: 1500, pontuacao: 1300 },
    { pescador: "Carla", tipo: "Robalo", etapaId: "e1", tamanho: 30, pesoGramas: 500, pontuacao: 200, removida: true },
  ];

  it("soma pontos, conta pescas e acha o maior peixe", () => {
    const ana = montarRanking(pescas, pescadores).find((x) => x.nome === "Ana");
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

describe("campeão da etapa", () => {
  const pescadores = ["Ana", "Bruno"];

  it("é quem lidera o ranking da etapa", () => {
    const campeao = campeaoDaEtapa(
      [
        { pescador: "Ana", tipo: "Robalo", etapaId: "e1", pontuacao: 300, pesoGramas: 100, tamanho: 10 },
        { pescador: "Bruno", tipo: "Robalo", etapaId: "e1", pontuacao: 900, pesoGramas: 100, tamanho: 10 },
      ],
      pescadores
    );
    assert.equal(campeao.nome, "Bruno");
    assert.equal(campeao.pontos, 900);
  });

  it("etapa sem nenhuma pesca não tem campeão", () => {
    // Sem isto o primeiro nome em ordem alfabética viraria campeão de uma
    // etapa que ninguém pescou.
    assert.equal(campeaoDaEtapa([], pescadores), null);
  });
});

describe("vitórias e quadro de títulos", () => {
  const pescadores = ["Ana", "Bruno", "Carla"];
  const etapas = [
    { id: "e1", nome: "1ª Etapa", encerrada: true },
    { id: "e2", nome: "2ª Etapa", encerrada: true },
    { id: "e3", nome: "Em disputa", encerrada: false },
    { id: "e4", nome: "Encerrada vazia", encerrada: true },
    { id: "e5", nome: "Removida", encerrada: true, removida: true },
  ];
  const pescas = [
    { etapaId: "e1", pescador: "Ana", tipo: "Robalo", pontuacao: 1000, pesoGramas: 100, tamanho: 10 },
    { etapaId: "e1", pescador: "Bruno", tipo: "Robalo", pontuacao: 500, pesoGramas: 100, tamanho: 10 },
    { etapaId: "e2", pescador: "Bruno", tipo: "Robalo", pontuacao: 2000, pesoGramas: 100, tamanho: 10 },
    { etapaId: "e3", pescador: "Carla", tipo: "Robalo", pontuacao: 9999, pesoGramas: 100, tamanho: 10 },
    { etapaId: "e5", pescador: "Carla", tipo: "Robalo", pontuacao: 5000, pesoGramas: 100, tamanho: 10 },
  ];

  it("só valem etapas encerradas, com pesca e não removidas", () => {
    assert.deepEqual(
      etapasComResultado(etapas, pescas).map((e) => e.id),
      ["e1", "e2"]
    );
  });

  it("conta uma vitória por etapa encerrada", () => {
    const quadro = contarTitulos(etapas, pescas, pescadores);
    assert.equal(quadro.find((x) => x.nome === "Ana").vitorias, 1);
    const bruno = quadro.find((x) => x.nome === "Bruno");
    assert.equal(bruno.vitorias, 1);
    assert.equal(bruno.segundos, 1);
    assert.deepEqual(bruno.ganhas, ["2ª Etapa"]);
  });

  it("etapa aberta não dá título — o líder ainda pode mudar", () => {
    const carla = contarTitulos(etapas, pescas, pescadores).find((x) => x.nome === "Carla");
    assert.equal(carla.vitorias, 0);
    assert.equal(carla.etapas, 0);
    assert.equal(carla.pontos, 0);
  });

  it("empate em vitórias desempata pelos segundos lugares", () => {
    const [primeiro, segundo] = contarTitulos(etapas, pescas, pescadores);
    assert.equal(primeiro.nome, "Bruno");
    assert.equal(segundo.nome, "Ana");
  });

  it("quem ganhou etapa passa na frente de quem só somou pontos", () => {
    const etapasB = [
      { id: "a", nome: "A", encerrada: true },
      { id: "b", nome: "B", encerrada: true },
    ];
    const pescasB = [
      { etapaId: "a", pescador: "Ana", tipo: "Robalo", pontuacao: 10, pesoGramas: 10, tamanho: 1 },
      { etapaId: "a", pescador: "Bruno", tipo: "Robalo", pontuacao: 5, pesoGramas: 10, tamanho: 1 },
      { etapaId: "b", pescador: "Carla", tipo: "Robalo", pontuacao: 2000, pesoGramas: 10, tamanho: 1 },
      { etapaId: "b", pescador: "Bruno", tipo: "Robalo", pontuacao: 1000, pesoGramas: 10, tamanho: 1 },
    ];
    const quadro = contarTitulos(etapasB, pescasB, pescadores);
    assert.deepEqual(
      quadro.map((x) => x.nome),
      ["Carla", "Ana", "Bruno"]
    );
    assert.equal(quadro[2].pontos, 1005);
    assert.equal(quadro[2].segundos, 2);
  });

  it("quem não pescou na etapa não recebe colocação nela", () => {
    const quadro = contarTitulos([etapas[1]], pescas, pescadores);
    assert.equal(quadro.find((x) => x.nome === "Ana").etapas, 0);
    assert.ok(quadro.every((x) => x.segundos === 0 && x.terceiros === 0));
  });

  it("pesca de pescador fora da lista não quebra a contagem", () => {
    const quadro = contarTitulos(etapas, pescas, ["Ana"]);
    assert.equal(quadro.length, 1);
    assert.equal(quadro[0].vitorias, 1);
  });
});

describe("recálculo em massa", () => {
  it("aplica os pontos novos da espécie nas pescas existentes", () => {
    const pescas = [{ id: "1", tipo: "Robalo", fator: 300, pesoGramas: 100, tamanho: 45, pontuacao: 346 }];
    const mapa = new Map([["Robalo", { nome: "Robalo", fator: 600, modo: "formula" }]]);
    const [nova] = recalcularTodas(pescas, mapa, AJUSTES_PADRAO);
    assert.equal(nova.pontuacao, 646); // 600 + 45 + 1
    assert.equal(nova.fator, 600);
  });

  it("mantém o objeto original quando nada muda (evita re-render à toa)", () => {
    const pescas = [{ id: "1", tipo: "Robalo", fator: 300, pesoGramas: 100, tamanho: 45, pontuacao: 346 }];
    const mapa = new Map([["Robalo", { nome: "Robalo", fator: 300, modo: "formula" }]]);
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
  it("mostra as três parcelas", () => {
    assert.equal(explicarPontuacao(peixe("Robalo Flecha"), 4300, 72), "300 + 72 + 43 = 415");
  });

  it("peixe fixo explica que é fixo", () => {
    assert.match(explicarPontuacao(peixe("Baiacu"), 0, 0), /-100 pontos fixos/);
  });
});
