// =========================================================================
//  Exportação — JSON, XML, CSV e compartilhamento do placar.
//
//  Pedido do Alex no grupo: "Fazer um botão de Export em json pra todo mundo
//  que tem o app poder pegar os dados e um botão de Export para XML".
// =========================================================================

import { VERSAO_APP } from "./config.js";
import { fotoComoDataUrl } from "./db.js";
import { montarRanking } from "./pontuacao.js";

/**
 * Monta o pacote de dados que vira JSON/XML.
 *
 * @param {object} opcoes
 * @param {"etapa"|"tudo"} opcoes.escopo
 * @param {boolean} opcoes.incluirFotos - fotos viram dataURL; infla muito o arquivo
 */
export async function montarPacote({ estado, escopo = "tudo", etapaId = null, incluirFotos = false }) {
  const etapas =
    escopo === "etapa"
      ? estado.etapas.filter((e) => e.id === etapaId && !e.removida)
      : estado.etapas.filter((e) => !e.removida);

  const idsEtapas = new Set(etapas.map((e) => e.id));
  const pescas = estado.pescas.filter((p) => !p.removida && idsEtapas.has(p.etapaId));

  const pescasSerializadas = [];
  for (const p of pescas) {
    const item = {
      id: p.id,
      etapaId: p.etapaId,
      pescador: p.pescador,
      peixe: p.tipo,
      fator: p.fator,
      pesoGramas: p.pesoGramas,
      tamanhoCm: p.tamanho,
      pontuacao: p.pontuacao,
      data: p.data,
    };
    if (incluirFotos && p.fotoId) {
      item.foto = await fotoComoDataUrl(p.fotoId);
    }
    pescasSerializadas.push(item);
  }

  return {
    app: "Bigode Pescador",
    versao: VERSAO_APP,
    exportadoEm: new Date().toISOString(),
    ajustes: estado.ajustes,
    pescadores: estado.pescadores,
    peixes: estado.peixes
      .filter((p) => !p.removido)
      .map((p) => ({
        nome: p.nome,
        fator: p.fator,
        modo: p.modo,
        pontosFixos: p.pontosFixos,
      })),
    etapas: etapas.map((e) => ({
      id: e.id,
      nome: e.nome,
      local: e.local,
      data: e.data,
      encerrada: e.encerrada,
      ranking: montarRanking(
        pescas.filter((p) => p.etapaId === e.id),
        estado.pescadores,
        estado.ajustes
      ).map((r, i) => ({
        posicao: i + 1,
        pescador: r.nome,
        pescas: r.qtd,
        maiorCm: r.maior,
        pesoTotalGramas: r.pesoTotal,
        pontos: r.pontos,
      })),
    })),
    pescas: pescasSerializadas,
  };
}

// ---- JSON -----------------------------------------------------------------

export function paraJson(pacote) {
  return JSON.stringify(pacote, null, 2);
}

// ---- XML ------------------------------------------------------------------

/** Escapa os cinco caracteres que quebram XML. */
function esc(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function paraXml(pacote) {
  const l = [];
  l.push('<?xml version="1.0" encoding="UTF-8"?>');
  l.push(`<bigodePescador versao="${esc(pacote.versao)}" exportadoEm="${esc(pacote.exportadoEm)}">`);

  l.push("  <pescadores>");
  pacote.pescadores.forEach((p) => l.push(`    <pescador>${esc(p)}</pescador>`));
  l.push("  </pescadores>");

  l.push("  <peixes>");
  pacote.peixes.forEach((p) =>
    l.push(
      `    <peixe nome="${esc(p.nome)}" modo="${esc(p.modo)}" fator="${esc(p.fator)}" pontosFixos="${esc(p.pontosFixos)}" />`
    )
  );
  l.push("  </peixes>");

  l.push("  <etapas>");
  pacote.etapas.forEach((e) => {
    l.push(
      `    <etapa id="${esc(e.id)}" data="${esc(e.data)}" encerrada="${esc(e.encerrada)}">`
    );
    l.push(`      <nome>${esc(e.nome)}</nome>`);
    l.push(`      <local>${esc(e.local)}</local>`);
    l.push("      <ranking>");
    e.ranking.forEach((r) =>
      l.push(
        `        <posicao numero="${esc(r.posicao)}" pescador="${esc(r.pescador)}" pescas="${esc(r.pescas)}" maiorCm="${esc(r.maiorCm)}" pesoTotalGramas="${esc(r.pesoTotalGramas)}" pontos="${esc(r.pontos)}" />`
      )
    );
    l.push("      </ranking>");
    l.push("    </etapa>");
  });
  l.push("  </etapas>");

  l.push("  <pescas>");
  pacote.pescas.forEach((p) => {
    l.push(`    <pesca id="${esc(p.id)}" etapaId="${esc(p.etapaId)}">`);
    l.push(`      <pescador>${esc(p.pescador)}</pescador>`);
    l.push(`      <peixe fator="${esc(p.fator)}">${esc(p.peixe)}</peixe>`);
    l.push(`      <pesoGramas>${esc(p.pesoGramas)}</pesoGramas>`);
    l.push(`      <tamanhoCm>${esc(p.tamanhoCm)}</tamanhoCm>`);
    l.push(`      <pontuacao>${esc(p.pontuacao)}</pontuacao>`);
    l.push(`      <data>${esc(p.data)}</data>`);
    if (p.foto) l.push(`      <foto>${esc(p.foto)}</foto>`);
    l.push("    </pesca>");
  });
  l.push("  </pescas>");

  l.push("</bigodePescador>");
  return l.join("\n");
}

// ---- CSV ------------------------------------------------------------------

// Ponto e vírgula, não vírgula: o Excel em português usa a vírgula como
// separador DECIMAL e só quebra colunas no ";". Com vírgula, o arquivo abria
// inteiro numa coluna só — que é como o pessoal ia receber no celular.
// O Google Sheets entende os dois.
const SEPARADOR_CSV = ";";

// "Byte order mark": sem ele o Excel lê o arquivo como se fosse da tabela de
// caracteres antiga e "Traíra" vira "TraÃ­ra".
const BOM_UTF8 = "﻿";

export function paraCsv(pacote) {
  const cabecalho = [
    "etapa",
    "data",
    "pescador",
    "peixe",
    "fator",
    "peso_gramas",
    "tamanho_cm",
    "pontuacao",
    "registrado_em",
  ];
  const nomeEtapa = new Map(pacote.etapas.map((e) => [e.id, e.nome]));

  const linhas = pacote.pescas.map((p) =>
    [
      nomeEtapa.get(p.etapaId) || "",
      (p.data || "").slice(0, 10),
      p.pescador,
      p.peixe,
      p.fator,
      p.pesoGramas,
      p.tamanhoCm,
      p.pontuacao,
      p.data,
    ]
      .map(campoCsv)
      .join(SEPARADOR_CSV)
  );

  return BOM_UTF8 + [cabecalho.join(SEPARADOR_CSV), ...linhas].join("\r\n");
}

function campoCsv(v) {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---- Download -------------------------------------------------------------

export function baixar(conteudo, nomeArquivo, tipoMime) {
  const blob = new Blob([conteudo], { type: `${tipoMime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoga depois para o download não ser cancelado no meio.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function nomeArquivo(base, extensao) {
  const d = new Date();
  const carimbo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const limpo = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${limpo}-${carimbo}.${extensao}`;
}

// ---- Importação -----------------------------------------------------------

/**
 * Lê um JSON exportado e devolve o pacote validado.
 * Não grava nada — quem decide o que fazer é quem chamou.
 */
export async function lerJson(arquivo) {
  const texto = await arquivo.text();
  const pacote = JSON.parse(texto);
  if (pacote.app !== "Bigode Pescador") {
    throw new Error("Este arquivo não é um export do Bigode Pescador.");
  }
  if (!Array.isArray(pacote.pescas) || !Array.isArray(pacote.etapas)) {
    throw new Error("Arquivo incompleto: faltam etapas ou pescas.");
  }
  return pacote;
}

// ---- Compartilhar o placar ------------------------------------------------

/** Resumo em texto do ranking, para mandar no grupo do WhatsApp. */
export function placarEmTexto(etapa, ranking) {
  const medalhas = ["🥇", "🥈", "🥉"];
  const linhas = [`🎣 *${etapa.nome}*`];
  if (etapa.local) linhas.push(`📍 ${etapa.local}`);
  linhas.push("");

  ranking
    .filter((r) => r.qtd > 0)
    .forEach((r, i) => {
      const medalha = medalhas[i] || `${i + 1}º`;
      // O bônus de espécies aparece separado: são pontos que não saem de peixe
      // nenhum da lista, e sem essa nota o placar parece somado errado.
      const bonus = r.bonus ? `, +${r.bonus} de bônus` : "";
      linhas.push(
        `${medalha} ${r.nome} — ${r.pontos} pts (${r.qtd} ${r.qtd === 1 ? "peixe" : "peixes"}${bonus})`
      );
    });

  if (!ranking.some((r) => r.qtd > 0)) linhas.push("_Nenhuma pesca registrada ainda._");

  linhas.push("");
  linhas.push("Bigode Pescador 🐟");
  return linhas.join("\n");
}

export async function compartilhar(texto, titulo = "Bigode Pescador") {
  if (navigator.share) {
    try {
      await navigator.share({ title: titulo, text: texto });
      return "compartilhado";
    } catch (e) {
      if (e.name === "AbortError") return "cancelado";
    }
  }
  // Sem Web Share API (desktop, principalmente): cai na área de transferência.
  try {
    await navigator.clipboard.writeText(texto);
    return "copiado";
  } catch {
    return "falhou";
  }
}
