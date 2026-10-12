"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

export async function entrar(_: string | undefined, dados: FormData) {
  const email = String(dados.get("email") ?? "").trim();
  const senha = String(dados.get("senha") ?? "");
  if (!email || !senha) return "Informe e-mail e senha.";

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return "E-mail ou senha inválidos.";
  redirect("/");
}
