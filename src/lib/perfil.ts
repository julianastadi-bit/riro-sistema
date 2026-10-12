import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Papel, Perfil } from "@/lib/tipos";

export const obterPerfil = cache(async (): Promise<Perfil | null> => {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("perfis")
    .select("id, nome, email, papel, ativo")
    .eq("id", user.id)
    .single();
  return (data as Perfil | null) ?? null;
});

/** Garante usuário ativo (e, opcionalmente, um dos papéis). Redireciona caso contrário. */
export async function exigirPerfil(...papeis: Papel[]): Promise<Perfil> {
  const perfil = await obterPerfil();
  if (!perfil) redirect("/sair");
  if (!perfil.ativo) redirect("/sair?erro=inativo");
  if (papeis.length && !papeis.includes(perfil.papel)) redirect("/");
  return perfil;
}

export const podeVerFinanceiro = (p: Papel) => p === "gerente" || p === "financeiro" || p === "admin";
export const podeConferir = (p: Papel) => p === "financeiro" || p === "admin";
