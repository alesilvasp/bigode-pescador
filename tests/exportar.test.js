// =========================================================================
//  Testes da exportação.
//
//  Cobrem o CSV, que existe para ser aberto no Excel/Sheets e vinha saindo
//  quebrado nos dois pontos que importam: acento e separação de colunas.
// =========================================================================

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { paraCsv, paraXml, placarEmTexto, nomeArquivo } from "../js/exportar.js";

const PACOTE = {
  app: "Bigode Pescador",
  versao: "2.0.0",
  exportadoEm: "2026-08-11T18:00:00.000Z",
  pescadores: ["Felipe Felix", "Alex Sakaki"],
  peixes: [{ nome: "Traíra", fator: 5, modo: "formula", pontosFixos: 0 }],
  etapas: [{ id: "etp_1", nome: "1ª Etapa", local: "Represa", data: "2026-08-11", encerrada: false, ranking: [] }],
  pescas: [
    {
      id: "psc_1",
      etapaId: "etp_1",
      pescador: "Felipe Felix",
      peixe: "Traíra",
      fator: 5,
      pesoGramas: 100,
      tamanhoCm: 45,
      pontuacao: 725,
      data: "2026-08-11T18:00:00.000Z",
    },
  ],
};

describe("CSV", () => {
  it("começa com BOM — sem ele o Excel mostra 'TraÃ­ra' no lugar de 'Traíra'", () => {
    assert.ok(paraCsv(PACOTE).startsWith("﻿"), "faltou o BOM no começo do arquivo");
  });

  it("separa colunas por ponto e vírgula, que é o que o Excel em português usa", () => {
    const linhas = paraCsv(PACOTE).split("\r\n");
    assert.equal(linhas[0].split(";").length, 9);
    assert.ok(!linhas[0].includes(","), "vírgula abriria o arquivo todo numa coluna só");
  });

  it("leva os dados da pesca para a linha certa", () => {
    const [, primeira] = paraCsv(PACOTE).split("\r\n");
    const campos = primeira.split(";");
    assert.equal(campos[0], "1ª Etapa");
    assert.equal(campos[2], "Felipe Felix");
    assert.equal(campos[3], "Traíra");
    assert.equal(campos[7], "725");
  });

  it("protege com aspas o campo que contém o separador", () => {
    const comPontoEVirgula = {
      ...PACOTE,
      pescas: [{ ...PACOTE.pescas[0], pescador: "Felipe; o pescador" }],
    };
    assert.ok(paraCsv(comPontoEVirgula).includes('"Felipe; o pescador"'));
  });

  it("dobra as aspas de dentro do campo, como manda o formato", () => {
    const comAspas = {
      ...PACOTE,
      pescas: [{ ...PACOTE.pescas[0], pescador: 'O "Bigode"' }],
    };
    assert.ok(paraCsv(comAspas).includes('"O ""Bigode"""'));
  });
});

describe("XML", () => {
  it("escapa o que quebraria o arquivo", () => {
    const perigoso = {
      ...PACOTE,
      pescas: [{ ...PACOTE.pescas[0], pescador: "Alex & <Bigode>" }],
    };
    const xml = paraXml(perigoso);
    assert.ok(xml.includes("Alex &amp; &lt;Bigode&gt;"));
    assert.ok(!xml.includes("<Bigode>"));
  });
});

describe("placar em texto", () => {
  it("lista só quem pescou, com medalha", () => {
    const texto = placarEmTexto(PACOTE.etapas[0], [
      { nome: "Felipe Felix", pontos: 725, qtd: 1 },
      { nome: "Alex Sakaki", pontos: 0, qtd: 0 },
    ]);
    assert.ok(texto.includes("🥇 Felipe Felix — 725 pts (1 peixe)"));
    assert.ok(!texto.includes("Alex Sakaki"));
  });

  it("avisa quando ninguém pescou ainda", () => {
    const texto = placarEmTexto(PACOTE.etapas[0], [{ nome: "Felipe Felix", pontos: 0, qtd: 0 }]);
    assert.ok(texto.includes("Nenhuma pesca registrada ainda"));
  });
});

describe("nome do arquivo", () => {
  it("troca acento pela letra sem acento", () => {
    assert.match(nomeArquivo("Pescaria em Ilhabela — Traíra", "csv"), /^pescaria-em-ilhabela-traira-/);
  });

  it("vira só letra, número e hífen — o resto o celular recusa no download", () => {
    const nome = nomeArquivo("bigode-1ª Etapa", "csv");
    assert.match(nome, /^[a-z0-9-]+\.csv$/);
    assert.match(nome, /-\d{4}-\d{2}-\d{2}\.csv$/, "faltou a data no fim");
  });

  it("não deixa hífen sobrando nas pontas", () => {
    const nome = nomeArquivo("### etapa ###", "json");
    assert.ok(!nome.startsWith("-"), `começou com hífen: ${nome}`);
    assert.match(nome, /^etapa-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
