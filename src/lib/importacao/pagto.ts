import "server-only";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { FormaDespesa } from "@/lib/tipos";

/**
 * Lê a aba PAGTO da planilha "FLUXO RIRO SALON" (.xlsx/.xlsm).
 * Colunas: A DATA · B FORNECEDOR · C REFERENTE · D EMPRESA · E P/B · F VENCIMENTO
 *          G NUMERO · H VALOR · I OK · J MOTIVO/CONTA · K BANCO
 */

export interface LinhaImportacao {
  linha: number;
  chave: string;
  empresa: string;
  fornecedor: string;
  descricao: string;
  forma: FormaDespesa;
  data_lancamento: string;
  competencia: string;
  vencimento: string;
  valor: number;
  documento: string | null;
  parcela: number | null;
  total_parcelas: number | null;
  pago: boolean;
  banco: string | null;
  categoria: string;
  plano_codigo: string | null;
}

export interface ResultadoLeitura {
  linhas: LinhaImportacao[];
  ignoradas: { linha: number; motivo: string }[];
}

// Categorias da planilha (coluna MOTIVO/CONTA) → plano de contas do sistema
const CATEGORIAS: Record<string, string> = {
  "DESPESAS DE PESSOAL": "4.01",
  "DESPESAS CAPACITACAO": "4.02",
  "DESPESAS DE OCUPACAO": "4.03",
  "DESPESAS MANUTENCAO": "4.04",
  "DESPESAS FUNCIONAMENTO": "4.05",
  MARKETING: "4.06",
  "MATERIAIS DE CONSUMO": "4.07",
  "CUSTO MERCADORIA": "3.01",
  IMOBILIZADO: "5.01",
  PROLABORE: "6.01",
  "PROCESSO OU EMPRESTIMO": "7.01",
  "PROCESSO/EMPRESTIMO": "7.01",
  IMPOSTOS: "2.02",
  IMPOSTO: "2.02",
};

const FORMAS: Record<string, FormaDespesa> = {
  BOLETO: "boleto",
  RECIBO: "recibo",
  TRANSFERENCIA: "transferencia",
  PIX: "pix",
  DINHEIRO: "dinheiro",
  CARTAO: "cartao",
  "DEBITO AUTOMATICO": "debito_automatico",
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const chaveTexto = (s: unknown) => semAcento(String(s ?? "")).toUpperCase().replace(/\s+/g, " ").trim();

function texto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null) {
    const o = v as { text?: string; richText?: { text: string }[]; result?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text) return o.text;
    if ("result" in o) return texto(o.result);
  }
  return String(v).replace(/\s+/g, " ").trim();
}

function numero(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "result" in v) return numero((v as { result: unknown }).result);
  return null;
}

/** Datas chegam como serial do Excel (estilos ignorados) ou Date */
function data(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const n = numero(v);
  if (n === null || n < 20000 || n > 80000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
}

const primeiroDia = (iso: string) => `${iso.slice(0, 7)}-01`;

export async function lerAbaPagto(conteudo: ArrayBuffer): Promise<ResultadoLeitura> {
  const leitor = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(Buffer.from(conteudo)), {
    worksheets: "emit",
    sharedStrings: "cache",
    styles: "ignore",
    hyperlinks: "ignore",
    entries: "ignore",
  });

  const linhas: LinhaImportacao[] = [];
  const ignoradas: ResultadoLeitura["ignoradas"] = [];
  const ocorrencias = new Map<string, number>();
  let achou = false;

  for await (const aba of leitor) {
    const nomeAba = chaveTexto((aba as unknown as { name: string }).name);
    if (nomeAba !== "PAGTO") {
      for await (const _ of aba) void _; // consome a aba para avançar o leitor
      continue;
    }
    achou = true;
    for await (const linha of aba) {
      const n = linha.number;
      if (n === 1) continue;
      const c = linha.values as unknown[];
      const valor = numero(c[8]);
      if (valor === null || valor === 0) continue;

      const fornecedor = texto(c[2]);
      const vencimento = data(c[6]);
      const empresa = texto(c[4]);
      if (!fornecedor || !vencimento || !empresa) {
        ignoradas.push({ linha: n, motivo: "Sem fornecedor, empresa ou vencimento" });
        continue;
      }
      if (valor < 0) {
        ignoradas.push({ linha: n, motivo: "Valor negativo" });
        continue;
      }

      const numeroDoc = texto(c[7]);
      let documento: string | null = numeroDoc || null;
      let parcela: number | null = null;
      let total: number | null = null;
      let competencia = primeiroDia(vencimento);
      const mParcela = numeroDoc.match(/^(\d{1,2})\/(\d{1,2})$/);
      const mMes = numeroDoc.match(/^(\d{2})\/(\d{4})$/);
      if (mParcela && Number(mParcela[1]) >= 1 && Number(mParcela[1]) <= Number(mParcela[2])) {
        parcela = Number(mParcela[1]);
        total = Number(mParcela[2]);
        documento = null;
      } else if (mMes && Number(mMes[1]) >= 1 && Number(mMes[1]) <= 12) {
        competencia = `${mMes[2]}-${mMes[1]}-01`; // ex.: FGTS 08/2026 pago em outubro
        documento = null;
      }

      const categoria = texto(c[10]);
      const banco = chaveTexto(c[11]) || null;
      const forma = FORMAS[chaveTexto(c[5])] ?? "boleto";
      const descricao = texto(c[3]) || fornecedor;
      const valorCentavos = Math.round(valor * 100) / 100;

      // Chave estável: mesmos dados + ordem de ocorrência (para duplicatas legítimas)
      const base = [chaveTexto(empresa), chaveTexto(fornecedor), chaveTexto(descricao), vencimento, valorCentavos.toFixed(2), numeroDoc].join("|");
      const vez = (ocorrencias.get(base) ?? 0) + 1;
      ocorrencias.set(base, vez);
      const chave = "pagto:" + createHash("sha1").update(`${base}|${vez}`).digest("hex");

      linhas.push({
        linha: n,
        chave,
        empresa,
        fornecedor,
        descricao,
        forma,
        data_lancamento: data(c[1]) ?? vencimento,
        competencia,
        vencimento,
        valor: valorCentavos,
        documento,
        parcela,
        total_parcelas: total,
        pago: chaveTexto(c[9]) === "OK",
        banco,
        categoria,
        plano_codigo: CATEGORIAS[chaveTexto(categoria)] ?? null,
      });
    }
  }

  if (!achou) throw new Error("A planilha não tem a aba PAGTO.");
  return { linhas, ignoradas };
}
