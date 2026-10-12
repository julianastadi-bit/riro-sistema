"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerValor } from "@/lib/formatacao";

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const opcional = (d: FormData, k: string) => texto(d, k) || null;
const marcado = (d: FormData, k: string) => d.get(k) === "on";

function voltar(aba: string, erro?: string) {
  revalidatePath("/cadastros");
  redirect(`/cadastros?aba=${aba}${erro ? `&erro=${encodeURIComponent(erro)}` : "&ok=1"}`);
}

function camposForma(d: FormData) {
  const gera = marcado(d, "gera_recebivel");
  return {
    nome: texto(d, "nome"),
    bandeira: opcional(d, "bandeira"),
    ordem: Number(texto(d, "ordem")) || 0,
    taxa_percentual: lerValor(texto(d, "taxa_percentual")) ?? 0,
    prazo_dias: Math.max(0, parseInt(texto(d, "prazo_dias"), 10) || 0),
    dias_uteis: marcado(d, "dias_uteis"),
    taxa_confirmada: marcado(d, "taxa_confirmada"),
    soma_total_avec: marcado(d, "soma_total_avec"),
    gera_recebivel: gera,
    receita_dre: marcado(d, "receita_dre"),
    destino: gera ? opcional(d, "destino") : null,
    ativo: marcado(d, "ativo"),
  };
}

export async function salvarForma(d: FormData) {
  await exigirPerfil("financeiro", "admin");
  const supabase = await criarClienteServidor();
  const id = texto(d, "id");
  const campos = camposForma(d);
  if (!campos.nome) voltar("formas", "Informe o nome.");
  const { error } = id
    ? await supabase.from("formas_pagamento").update(campos).eq("id", id)
    : await supabase.from("formas_pagamento").insert({
        ...campos,
        codigo: texto(d, "codigo").toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
        grupo: texto(d, "grupo"),
        adquirente_id: opcional(d, "adquirente_id"),
      });
  voltar("formas", error?.message);
}

export async function salvarEmpresa(d: FormData) {
  await exigirPerfil("financeiro", "admin");
  const supabase = await criarClienteServidor();
  const id = texto(d, "id");
  const campos = {
    nome: texto(d, "nome"),
    razao_social: opcional(d, "razao_social"),
    cnpj: opcional(d, "cnpj"),
    ativo: id ? marcado(d, "ativo") : true,
    ...(id && {
      conta_caixa_id: opcional(d, "conta_caixa_id"),
      conta_banco_id: opcional(d, "conta_banco_id"),
      conta_adquirente_id: opcional(d, "conta_adquirente_id"),
    }),
  };
  if (!campos.nome) voltar("empresas", "Informe o nome.");
  const { error } = id
    ? await supabase.from("empresas").update(campos).eq("id", id)
    : await supabase.from("empresas").insert(campos);
  voltar("empresas", error?.message);
}

export async function salvarConta(d: FormData) {
  await exigirPerfil("financeiro", "admin");
  const supabase = await criarClienteServidor();
  const id = texto(d, "id");
  const campos = {
    nome: texto(d, "nome"),
    banco: opcional(d, "banco"),
    agencia: opcional(d, "agencia"),
    numero: opcional(d, "numero"),
    ativo: id ? marcado(d, "ativo") : true,
  };
  if (!campos.nome) voltar("contas", "Informe o nome.");
  const { error } = id
    ? await supabase.from("contas_financeiras").update(campos).eq("id", id)
    : await supabase
        .from("contas_financeiras")
        .insert({ ...campos, empresa_id: texto(d, "empresa_id"), tipo: texto(d, "tipo") });
  voltar("contas", error?.message);
}

export async function salvarPlanoConta(d: FormData) {
  await exigirPerfil("financeiro", "admin");
  const supabase = await criarClienteServidor();
  const id = texto(d, "id");
  const campos = {
    nome: texto(d, "nome"),
    descricao: opcional(d, "descricao"),
    ativo: id ? marcado(d, "ativo") : true,
  };
  if (!campos.nome) voltar("plano", "Informe o nome.");
  const { error } = id
    ? await supabase.from("plano_contas").update(campos).eq("id", id)
    : await supabase.from("plano_contas").insert({
        ...campos,
        codigo: texto(d, "codigo"),
        grupo: texto(d, "grupo"),
        tipo: texto(d, "tipo"),
        ordem: Math.round(Number(texto(d, "codigo").replace(".", "")) || 999),
      });
  voltar("plano", error?.message);
}

export async function salvarFornecedor(d: FormData) {
  await exigirPerfil("financeiro", "admin");
  const supabase = await criarClienteServidor();
  const id = texto(d, "id");
  const campos = {
    nome: texto(d, "nome").replace(/\s+/g, " "),
    documento: opcional(d, "documento"),
    plano_conta_id: opcional(d, "plano_conta_id"),
    forma_padrao: opcional(d, "forma_padrao"),
    chave_pix: opcional(d, "chave_pix"),
    observacoes: opcional(d, "observacoes"),
    ativo: id ? marcado(d, "ativo") : true,
  };
  if (!campos.nome) voltar("fornecedores", "Informe o nome.");
  const { error } = id
    ? await supabase.from("fornecedores").update(campos).eq("id", id)
    : await supabase.from("fornecedores").insert(campos);
  voltar("fornecedores", error?.code === "23505" ? "Já existe um fornecedor com esse nome." : error?.message);
}
