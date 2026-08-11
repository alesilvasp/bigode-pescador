// =========================================================================
//  Testes da marca d'água do sync.
//
//  Trava a correção do bug mais grave que o QA achou: a marca de "até onde já
//  baixei" era o relógio do próprio celular. Bastava o aparelho estar alguns
//  minutos adiantado para ele gravar uma marca no futuro e nunca mais pedir o
//  que os outros registraram nesse intervalo — o dado sumia sem erro nenhum.
//
//  Agora a marca vem do dado que o servidor devolveu, então é sempre relógio
//  de servidor comparado com relógio de servidor.
// =========================================================================

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// `sync.js` importa `estado.js`, que fala com o navegador assim que carrega.
// Estes dois stubs bastam para o módulo subir dentro do Node.
globalThis.navigator ??= { onLine: true };
globalThis.window ??= { addEventListener() {} };

const { carimboMaisRecente } = await import("../js/sync.js");

const ANTERIOR = "2026-08-11T18:00:00.000Z";

describe("marca d'água do sync", () => {
  it("avança para o registro mais recente que chegou", () => {
    const registros = [
      { atualizada_em: "2026-08-11T18:00:05.000Z" },
      { atualizada_em: "2026-08-11T18:00:09.000Z" },
      { atualizada_em: "2026-08-11T18:00:07.000Z" },
    ];
    assert.equal(carimboMaisRecente(ANTERIOR, registros), "2026-08-11T18:00:09.000Z");
  });

  it("não anda quando nada chegou", () => {
    assert.equal(carimboMaisRecente(ANTERIOR, []), ANTERIOR);
    assert.equal(carimboMaisRecente(ANTERIOR, null), ANTERIOR);
    assert.equal(carimboMaisRecente(ANTERIOR, undefined), ANTERIOR);
  });

  it("nunca volta atrás — registro antigo não puxa a marca para trás", () => {
    const registros = [{ atualizada_em: "2020-01-01T00:00:00.000Z" }];
    assert.equal(carimboMaisRecente(ANTERIOR, registros), ANTERIOR);
  });

  it("ignora registro sem data em vez de quebrar a marca", () => {
    const registros = [{ atualizada_em: "2026-08-11T18:00:04.000Z" }, {}, null];
    assert.equal(carimboMaisRecente(ANTERIOR, registros), "2026-08-11T18:00:04.000Z");
  });

  it("o relógio local não participa da conta", () => {
    // O celular está 10 minutos adiantado. Antes, a marca virava 18:10 e tudo
    // que os outros gravassem até lá ficava invisível para sempre. A marca
    // agora só reflete o que o servidor devolveu.
    const doServidor = [{ atualizada_em: "2026-08-11T18:00:03.000Z" }];
    const marca = carimboMaisRecente(ANTERIOR, doServidor);

    assert.equal(marca, "2026-08-11T18:00:03.000Z");
    assert.ok(marca < "2026-08-11T18:10:00.000Z", "a marca não pode saltar para o futuro");
  });

  it("empate no mesmo instante mantém a marca (insert em lote grava tudo igual)", () => {
    const mesmoInstante = "2026-08-11T18:00:06.000Z";
    const registros = [{ atualizada_em: mesmoInstante }, { atualizada_em: mesmoInstante }];
    assert.equal(carimboMaisRecente(ANTERIOR, registros), mesmoInstante);
  });
});
