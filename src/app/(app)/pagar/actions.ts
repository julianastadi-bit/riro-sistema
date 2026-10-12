"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerValor, somarMeses } from "@/lib/formatacao";
import { lerAbaPagto } from "@/lib/importacao/pagto";
import type { FormaDespesa } from "@/lib/tipos";

export type Resultado = { erro?: string; ok?: string };

const FORMAS: FormaDespesa[] = ["boleto", "pix", "transferencia", "recibo", "debito_automatico", "cartao", "dinheiro"];
const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function atualizarTelas(id?: string) {
  revalidatePath("/pagar");
  revalidatePath("/");
  if (id) revalidatePath(`/pagar/${id}`);
}

/** Acha o fornecedor pelo nome (sem diferenciar maiúsculas) ou cria um novo */
async function resolverFornecedor(nome: string, planoId: string, forma: FormaDespesa) {
  const supabase = await criarClienteServidor();
  const { data: lista } = await supabase.from("fornecedores").select("id, nome").ilike("nome", nome.replace(/[%_]/g, "\\$&"));
  const existente = lista?.find((f) => f.nome.trim().toUpperCase() === nome.toUpperCase());
  if (existente) return { id: existente.id as string };
  const { data, error } = await supabase
    .from("fornecedores")
    .insert({ nome, plano_conta_id: planoId, forma_padrao: forma })
    .select("id")
    .single();
  if (error) return { erro: error.message };
  return { id: data.id as string };
}

export async function salvarContaPagar(_: Resultado | undefined, d: FormData): Promise<Resultado> {
  await exigirPerfil("financeiro", "admin");
  const id = texto(d, "id");
  const fornecedorNome = texto(d, "fornecedor").replace(/\s+/g, " ");
  const plano_conta_id = texto(d, "plano_conta_id");
  const empresa_id = texto(d, "empresa_id");
  const forma = texto(d, "forma") as FormaDespesa;
  const descricao = texto(d, "descricao");
  const vencimento = texto(d, "data_vencimento");
  const competenciaMes = texto(d, "competencia"); // AAAA-MM
  const valor = lerValor(texto(d, "valor"));

  if (!fornecedorNome) return { erro: "Informe o fornecedor." };
  if (!empresa_id || !plano_conta_id) return { erro: "Informe empresa e categoria." };
  if (!FORMAS.includes(forma)) return { erro: "Forma de pagamento inválida." };
  if (!descricao) return { erro: "Descreva a conta." };
  if (!dataValida(vencimento)) return { erro: "Informe o vencimento." };
  if (!/^\d{4}-\d{2}$/.test(competenciaMes)) return { erro: "Informe o mês de competência." };
  if (!valor || valor <= 0) return { erro: "Informe um valor maior que zero." };

  const forn = await resolverFornecedor(fornecedorNome, plano_conta_id, forma);
  if (forn.erro) return { erro: forn.erro };

  const base = {
    empresa_id,
    fornecedor_id: forn.id!,
    plano_conta_id,
    descricao,
    forma,
    documento: texto(d, "documento") || null,
    codigo_barras: texto(d, "codigo_barras").replace(/\s/g, "") || null,
    observacoes: texto(d, "observacoes") || null,
  };
  const supabase = await criarClienteServidor();

  if (id) {
    const { error } = await supabase
      .from("contas_pagar")
      .update({ ...base, valor, data_vencimento: vencimento, competencia: `${competenciaMes}-01` })
      .eq("id", id);
    if (error) return { erro: error.message };
    atualizarTelas(id);
    return { ok: "Conta atualizada." };
  }

  // Nova: única, parcelada (divide o valor) ou recorrente (repete o valor)
  const modo = texto(d, "modo");
  const vezes = modo === "unica" ? 1 : Math.min(60, Math.max(2, parseInt(texto(d, "vezes"), 10) || 0));
  if (modo !== "unica" && vezes < 2) return { erro: "Informe em quantas vezes." };
  const centavos = Math.round(valor * 100);
  const grupo_id = vezes > 1 ? randomUUID() : null;
  const linhas = Array.from({ length: vezes }, (_, i) => {
    let v = valor;
    if (modo === "parcelada") {
      const parte = Math.floor(centavos / vezes);
      v = (i === 0 ? centavos - parte * (vezes - 1) : parte) / 100;
    }
    return {
      ...base,
      valor: v,
      data_vencimento: somarMeses(vencimento, i),
      competencia: somarMeses(`${competenciaMes}-01`, i),
      parcela: modo === "parcelada" ? i + 1 : null,
      total_parcelas: modo === "parcelada" ? vezes : null,
      grupo_id,
    };
  });

  const { data, error } = await supabase.from("contas_pagar").insert(linhas).select("id");
  if (error) return { erro: error.message };
  atualizarTelas();
  redirect(vezes === 1 ? `/pagar/${data[0].id}?criada=1` : `/pagar?criadas=${vezes}`);
}

export async function pagarContas(
  ids: string[],
  dataPagamento: string,
  contaId: string,
  juros = 0,
  desconto = 0,
): Promise<Resultado> {
  await exigirPerfil("financeiro", "admin");
  if (!ids.length) return { erro: "Selecione ao menos uma conta." };
  if (!dataValida(dataPagamento)) return { erro: "Informe a data do pagamento." };
  if (!contaId) return { erro: "Informe a conta de onde saiu o pagamento." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("pagar_contas", {
    p_ids: ids,
    p_data: dataPagamento,
    p_conta: contaId,
    p_juros: juros,
    p_desconto: desconto,
  });
  if (error) return { erro: error.message };
  atualizarTelas(ids.length === 1 ? ids[0] : undefined);
  return { ok: ids.length === 1 ? "Pagamento registrado." : `${ids.length} pagamentos registrados.` };
}

export async function estornarPagamento(id: string, motivo: string): Promise<Resultado> {
  await exigirPerfil("financeiro", "admin");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("estornar_pagamento", { p_id: id, p_motivo: motivo });
  if (error) return { erro: error.message };
  atualizarTelas(id);
  return { ok: "Pagamento estornado. A conta voltou a ficar em aberto." };
}

export async function cancelarContaPagar(id: string, motivo: string): Promise<Resultado> {
  await exigirPerfil("financeiro", "admin");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("cancelar_conta_pagar", { p_id: id, p_motivo: motivo });
  if (error) return { erro: error.message };
  atualizarTelas(id);
  return { ok: "Conta cancelada." };
}

export async function excluirContaPagar(id: string): Promise<Resultado> {
  await exigirPerfil("financeiro", "admin");
  const supabase = await criarClienteServidor();
  const { error, count } = await supabase.from("contas_pagar").delete({ count: "exact" }).eq("id", id);
  if (error) return { erro: error.message };
  if (!count) return { erro: "Conta não encontrada." };
  atualizarTelas();
  redirect("/pagar");
}

const TIPOS_ANEXO = ["image/png", "image/jpeg", "image/webp", "image/heic", "application/pdf"];

export async function anexarArquivo(id: string, tipo: "boleto" | "comprovante", d: FormData): Promise<Resultado> {
  await exigirPerfil("financeiro", "admin");
  const arquivo = d.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione um arquivo." };
  if (arquivo.size > 5 * 1024 * 1024) return { erro: "Arquivo maior que 5 MB." };
  if (!TIPOS_ANEXO.includes(arquivo.type)) return { erro: "Envie PDF ou imagem (PNG/JPG)." };

  const supabase = await criarClienteServidor();
  const extensao = arquivo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const caminho = `${id}/${tipo}-${Date.now()}.${extensao}`;
  const { error: e1 } = await supabase.storage.from("contas-pagar").upload(caminho, arquivo, { contentType: arquivo.type });
  if (e1) return { erro: e1.message };
  const { error: e2 } = await supabase
    .from("contas_pagar")
    .update(tipo === "boleto" ? { boleto_path: caminho } : { comprovante_path: caminho })
    .eq("id", id);
  if (e2) return { erro: e2.message };
  atualizarTelas(id);
  return { ok: tipo === "boleto" ? "Boleto anexado." : "Comprovante anexado." };
}

// ─── Importação da planilha ───

export interface Previa {
  erro?: string;
  arquivo?: string;
  total?: number;
  valorTotal?: number;
  pagas?: number;
  jaImportadas?: number;
  porMes?: { mes: string; qtd: number; valor: number }[];
  porCategoria?: { categoria: string; codigo: string | null; qtd: number; valor: number }[];
  porEmpresa?: { empresa: string; qtd: number; valor: number }[];
  pagasSemBanco?: number;
  ignoradas?: { linha: number; motivo: string }[];
  amostra?: { linha: number; fornecedor: string; descricao: string; vencimento: string; valor: number; pago: boolean; categoria: string }[];
}

async function lerArquivo(d: FormData) {
  const arquivo = d.get("planilha");
  if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error("Selecione a planilha.");
  if (arquivo.size > 6 * 1024 * 1024) throw new Error("Planilha maior que 6 MB.");
  if (!/\.xls[xm]$/i.test(arquivo.name)) throw new Error("Envie o arquivo .xlsx ou .xlsm do fluxo.");
  return { nome: arquivo.name, leitura: await lerAbaPagto(await arquivo.arrayBuffer()) };
}

function agrupar<T>(itens: T[], chave: (i: T) => string, valor: (i: T) => number) {
  const m = new Map<string, { qtd: number; valor: number }>();
  for (const i of itens) {
    const k = chave(i);
    const atual = m.get(k) ?? { qtd: 0, valor: 0 };
    m.set(k, { qtd: atual.qtd + 1, valor: Math.round((atual.valor + valor(i)) * 100) / 100 });
  }
  return [...m.entries()];
}

export async function analisarPlanilha(_: Previa | undefined, d: FormData): Promise<Previa> {
  await exigirPerfil("financeiro", "admin");
  try {
    const { nome, leitura } = await lerArquivo(d);
    const { linhas } = leitura;
    const supabase = await criarClienteServidor();
    const chaves = linhas.map((l) => l.chave);
    let jaImportadas = 0;
    // lotes pequenos: as chaves vão na URL da consulta
    for (let i = 0; i < chaves.length; i += 50) {
      const { count, error } = await supabase
        .from("contas_pagar")
        .select("id", { count: "exact", head: true })
        .in("chave_importacao", chaves.slice(i, i + 50));
      if (error) throw new Error("Não foi possível verificar o que já foi importado.");
      jaImportadas += count ?? 0;
    }
    return {
      arquivo: nome,
      total: linhas.length,
      valorTotal: Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100,
      pagas: linhas.filter((l) => l.pago).length,
      jaImportadas,
      pagasSemBanco: linhas.filter((l) => l.pago && !l.banco).length,
      porMes: agrupar(linhas, (l) => l.vencimento.slice(0, 7), (l) => l.valor)
        .map(([mes, v]) => ({ mes, ...v }))
        .sort((a, b) => a.mes.localeCompare(b.mes)),
      porCategoria: agrupar(linhas, (l) => `${l.plano_codigo ?? ""}|${l.categoria || "(sem categoria)"}`, (l) => l.valor)
        .map(([k, v]) => ({ codigo: k.split("|")[0] || null, categoria: k.split("|")[1], ...v }))
        .sort((a, b) => b.valor - a.valor),
      porEmpresa: agrupar(linhas, (l) => l.empresa, (l) => l.valor).map(([empresa, v]) => ({ empresa, ...v })),
      ignoradas: leitura.ignoradas,
      amostra: linhas.slice(0, 8).map((l) => ({
        linha: l.linha,
        fornecedor: l.fornecedor,
        descricao: l.descricao,
        vencimento: l.vencimento,
        valor: l.valor,
        pago: l.pago,
        categoria: l.categoria,
      })),
    };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível ler a planilha." };
  }
}

export interface ResultadoImportacao {
  erro?: string;
  inseridas?: number;
  pagas?: number;
  existentes?: number;
  novos_fornecedores?: number;
  avisos?: { linha: number; aviso: string }[];
}

export async function importarPlanilha(_: ResultadoImportacao | undefined, d: FormData): Promise<ResultadoImportacao> {
  await exigirPerfil("financeiro", "admin");
  try {
    const { leitura } = await lerArquivo(d);
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("importar_contas_pagar", { p_itens: leitura.linhas });
    if (error) return { erro: error.message };
    atualizarTelas();
    return data as ResultadoImportacao;
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha na importação." };
  }
}
