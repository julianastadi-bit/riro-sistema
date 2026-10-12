"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Resultado = { erro?: string; ok?: string };

export interface DadosFechamento {
  total_avec: number | null;
  dinheiro_inicial: number;
  dinheiro_contado: number | null;
  observacoes: string;
  itens: { forma_pagamento_id: string; quantidade: number; valor: number }[];
  movimentos: { tipo: "sangria" | "suprimento"; valor: number; descricao: string }[];
}

const naoNegativo = (v: number | null) => v === null || (Number.isFinite(v) && v >= 0);

function validar(d: DadosFechamento): string | null {
  if (!naoNegativo(d.total_avec) || !naoNegativo(d.dinheiro_inicial) || !naoNegativo(d.dinheiro_contado)) {
    return "Valores não podem ser negativos.";
  }
  for (const i of d.itens) {
    if (!naoNegativo(i.valor) || !Number.isInteger(i.quantidade) || i.quantidade < 0) {
      return "Há valores ou quantidades inválidos nas formas de pagamento.";
    }
  }
  for (const m of d.movimentos) {
    if (!(m.valor > 0)) return "Sangrias/suprimentos precisam de valor maior que zero.";
    if (!m.descricao.trim()) return "Descreva cada sangria/suprimento.";
  }
  return null;
}


export async function criarFechamento(dados: FormData) {
  await exigirPerfil();
  const empresa_id = String(dados.get("empresa_id") ?? "");
  const data = String(dados.get("data") ?? "");
  if (!empresa_id || !/^\d{4}-\d{2}-\d{2}$/.test(data)) redirect("/fechamentos/novo?erro=dados");

  const supabase = await criarClienteServidor();
  const { data: existente } = await supabase
    .from("fechamentos_caixa")
    .select("id")
    .eq("empresa_id", empresa_id)
    .eq("data", data)
    .maybeSingle();
  if (existente) redirect(`/fechamentos/${existente.id}`);

  const { data: novo, error } = await supabase
    .from("fechamentos_caixa")
    .insert({ empresa_id, data })
    .select("id")
    .single();
  if (error || !novo) redirect(`/fechamentos/novo?erro=${encodeURIComponent(error?.message ?? "falha")}`);
  revalidatePath("/fechamentos");
  redirect(`/fechamentos/${novo.id}`);
}

async function gravar(id: string, d: DadosFechamento): Promise<string | undefined> {
  const invalido = validar(d);
  if (invalido) return invalido;
  const supabase = await criarClienteServidor();

  const { error: e1 } = await supabase
    .from("fechamentos_caixa")
    .update({
      total_avec: d.total_avec,
      dinheiro_inicial: d.dinheiro_inicial,
      dinheiro_contado: d.dinheiro_contado,
      observacoes: d.observacoes.trim() || null,
    })
    .eq("id", id);
  if (e1) return e1.message;

  const { error: e2 } = await supabase
    .from("fechamento_itens")
    .upsert(d.itens.map((i) => ({ ...i, fechamento_id: id })), { onConflict: "fechamento_id,forma_pagamento_id" });
  if (e2) return e2.message;

  const { error: e3 } = await supabase.from("movimentos_caixa").delete().eq("fechamento_id", id);
  if (e3) return e3.message;
  if (d.movimentos.length) {
    const { error: e4 } = await supabase
      .from("movimentos_caixa")
      .insert(d.movimentos.map((m) => ({ ...m, descricao: m.descricao.trim(), fechamento_id: id })));
    if (e4) return e4.message;
  }
  return undefined;
}

export async function salvarFechamento(id: string, d: DadosFechamento): Promise<Resultado> {
  await exigirPerfil();
  const erro = await gravar(id, d);
  if (erro) return { erro };
  revalidatePath(`/fechamentos/${id}`);
  return { ok: "Rascunho salvo." };
}

export async function enviarFechamento(id: string, d: DadosFechamento): Promise<Resultado> {
  await exigirPerfil();
  const erro = await gravar(id, d);
  if (erro) return { erro };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("enviar_fechamento", { p_id: id });
  if (error) return { erro: error.message };
  revalidatePath("/fechamentos");
  revalidatePath(`/fechamentos/${id}`);
  revalidatePath("/recebiveis");
  return { ok: "Fechamento enviado. Contas a receber geradas." };
}

export async function conferirFechamento(id: string): Promise<Resultado> {
  await exigirPerfil("financeiro", "admin");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("conferir_fechamento", { p_id: id });
  if (error) return { erro: error.message };
  revalidatePath("/fechamentos");
  revalidatePath(`/fechamentos/${id}`);
  return { ok: "Fechamento conferido." };
}

export async function reabrirFechamento(id: string, motivo: string): Promise<Resultado> {
  await exigirPerfil("financeiro", "admin");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("reabrir_fechamento", { p_id: id, p_motivo: motivo });
  if (error) return { erro: error.message };
  revalidatePath("/fechamentos");
  revalidatePath(`/fechamentos/${id}`);
  revalidatePath("/recebiveis");
  return { ok: "Fechamento reaberto como rascunho." };
}

export async function excluirFechamento(id: string): Promise<Resultado> {
  await exigirPerfil();
  const supabase = await criarClienteServidor();
  const { error, count } = await supabase.from("fechamentos_caixa").delete({ count: "exact" }).eq("id", id);
  if (error) return { erro: error.message };
  if (!count) return { erro: "Você não tem permissão para excluir este fechamento." };
  revalidatePath("/fechamentos");
  redirect("/fechamentos");
}

const TIPOS_COMPROVANTE = ["image/png", "image/jpeg", "image/webp", "image/heic", "application/pdf"];

export async function anexarComprovante(id: string, dados: FormData): Promise<Resultado> {
  await exigirPerfil();
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione um arquivo." };
  if (arquivo.size > 5 * 1024 * 1024) return { erro: "Arquivo maior que 5 MB." };
  if (!TIPOS_COMPROVANTE.includes(arquivo.type)) return { erro: "Envie imagem (PNG/JPG) ou PDF." };

  const supabase = await criarClienteServidor();
  const extensao = arquivo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const caminho = `${id}/${Date.now()}.${extensao}`;
  const { error: e1 } = await supabase.storage
    .from("comprovantes")
    .upload(caminho, arquivo, { contentType: arquivo.type });
  if (e1) return { erro: e1.message };

  const { error: e2 } = await supabase.from("fechamentos_caixa").update({ comprovante_path: caminho }).eq("id", id);
  if (e2) return { erro: e2.message };
  revalidatePath(`/fechamentos/${id}`);
  return { ok: "Comprovante anexado." };
}
