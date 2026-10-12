import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Cabecalho } from "@/components/ui";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/formatacao";
import type { Fornecedor, PlanoConta } from "@/lib/tipos";
import { FormularioConta } from "../FormularioConta";

export const metadata = { title: "Nova conta a pagar" };

export default async function PaginaNovaConta() {
  await exigirPerfil("financeiro", "admin");
  const supabase = await criarClienteServidor();
  const [{ data: empresas }, { data: fornecedores }, { data: categorias }] = await Promise.all([
    supabase.from("empresas").select("id, nome").eq("ativo", true).order("principal", { ascending: false }),
    supabase.from("fornecedores").select("id, nome, plano_conta_id, forma_padrao").eq("ativo", true).order("nome"),
    supabase.from("plano_contas").select("id, codigo, nome, grupo, tipo, ativo").neq("tipo", "receita").eq("ativo", true).order("ordem"),
  ]);
  return (
    <div className="max-w-3xl">
      <Link href="/pagar" className="mb-4 inline-flex items-center gap-1 text-sm text-cobre-700 hover:underline">
        <ChevronLeft size={16} /> Contas a pagar
      </Link>
      <Cabecalho titulo="Nova conta a pagar" subtitulo="Boleto, folha, imposto ou qualquer saída prevista." />
      <FormularioConta
        empresas={empresas ?? []}
        fornecedores={(fornecedores ?? []) as Fornecedor[]}
        categorias={(categorias ?? []) as PlanoConta[]}
        hoje={hojeSP()}
      />
    </div>
  );
}
