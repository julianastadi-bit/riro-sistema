"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Papel } from "@/lib/tipos";

const PAPEIS: Papel[] = ["operacao", "gerente", "financeiro", "admin"];
const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

function voltar(erro?: string, ok?: string) {
  revalidatePath("/usuarios");
  const qs = erro ? `erro=${encodeURIComponent(erro)}` : `ok=${encodeURIComponent(ok ?? "Salvo.")}`;
  redirect(`/usuarios?${qs}`);
}

export async function criarUsuario(d: FormData) {
  await exigirPerfil("admin");
  const nome = texto(d, "nome");
  const email = texto(d, "email").toLowerCase();
  const senha = texto(d, "senha");
  const papel = texto(d, "papel") as Papel;
  if (!nome || !email) voltar("Informe nome e e-mail.");
  if (senha.length < 8) voltar("A senha provisória precisa de ao menos 8 caracteres.");
  if (!PAPEIS.includes(papel)) voltar("Perfil inválido.");

  const admin = criarClienteAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error || !data.user) voltar(error?.message ?? "Falha ao criar usuário.");
  const { error: e2 } = await admin.from("perfis").update({ nome, papel }).eq("id", data.user!.id);
  voltar(e2?.message, `Usuário ${email} criado.`);
}

export async function atualizarUsuario(d: FormData) {
  const eu = await exigirPerfil("admin");
  const id = texto(d, "id");
  const papel = texto(d, "papel") as Papel;
  const ativo = d.get("ativo") === "on";
  if (!PAPEIS.includes(papel)) voltar("Perfil inválido.");
  if (id === eu.id && (papel !== "admin" || !ativo)) voltar("Você não pode remover seu próprio acesso de administrador.");

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("perfis").update({ nome: texto(d, "nome"), papel, ativo }).eq("id", id);
  if (error) voltar(error.message);

  const senha = texto(d, "senha");
  if (senha) {
    if (senha.length < 8) voltar("A nova senha precisa de ao menos 8 caracteres.");
    const { error: e2 } = await criarClienteAdmin().auth.admin.updateUserById(id, { password: senha });
    if (e2) voltar(e2.message);
  }
  voltar(undefined, "Usuário atualizado.");
}
