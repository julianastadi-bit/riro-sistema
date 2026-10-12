import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Selo } from "@/components/ui";
import { exigirPerfil, podeConferir } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { diaSemana, formatarData, formatarDataHora } from "@/lib/formatacao";
import type { Fechamento, FechamentoItem, FormaPagamento, MovimentoCaixa } from "@/lib/tipos";
import { ROTULO_STATUS_FECHAMENTO, TOM_STATUS_FECHAMENTO } from "@/lib/tipos";
import { FormularioFechamento } from "./FormularioFechamento";

export const metadata = { title: "Fechamento de caixa" };

export default async function PaginaFechamento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await exigirPerfil();
  const supabase = await criarClienteServidor();

  const { data: fechamento } = await supabase
    .from("fechamentos_caixa")
    .select("*, empresa:empresas(nome)")
    .eq("id", id)
    .maybeSingle();
  if (!fechamento) notFound();

  const [{ data: formas }, { data: itens }, { data: movimentos }, { data: pessoas }, { data: reaberturas }] =
    await Promise.all([
      supabase.from("formas_pagamento").select("*").eq("ativo", true).order("ordem"),
      supabase.from("fechamento_itens").select("id, forma_pagamento_id, quantidade, valor").eq("fechamento_id", id),
      supabase.from("movimentos_caixa").select("id, tipo, valor, descricao").eq("fechamento_id", id).order("criado_em"),
      supabase.from("perfis").select("id, nome"),
      supabase
        .from("auditoria")
        .select("motivo, criado_em")
        .eq("tabela", "fechamentos_caixa")
        .eq("registro_id", id)
        .eq("acao", "REABERTURA")
        .order("criado_em", { ascending: false }),
    ]);

  let urlComprovante: string | null = null;
  if (fechamento.comprovante_path) {
    const { data } = await supabase.storage.from("comprovantes").createSignedUrl(fechamento.comprovante_path, 600);
    urlComprovante = data?.signedUrl ?? null;
  }

  const nome = (uid: string | null) => pessoas?.find((p) => p.id === uid)?.nome ?? "—";
  const f = fechamento as Fechamento & { empresa: { nome: string } | null; enviado_por: string | null; conferido_por: string | null; criado_por: string | null };

  // Itens de formas desativadas continuam visíveis se tiverem valor
  const idsAtivos = new Set((formas ?? []).map((x) => x.id));
  const faltantes = (itens ?? []).filter((i) => !idsAtivos.has(i.forma_pagamento_id) && Number(i.valor) > 0);
  let formasExibidas = (formas ?? []) as FormaPagamento[];
  if (faltantes.length) {
    const { data: extras } = await supabase
      .from("formas_pagamento")
      .select("*")
      .in("id", faltantes.map((i) => i.forma_pagamento_id));
    formasExibidas = [...formasExibidas, ...((extras ?? []) as FormaPagamento[])].sort((a, b) => a.ordem - b.ordem);
  }

  return (
    <>
      <Link href="/fechamentos" className="mb-4 inline-flex items-center gap-1 text-sm text-cobre-700 hover:underline">
        <ChevronLeft size={16} /> Fechamentos
      </Link>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cobre-700">{f.empresa?.nome}</p>
          <h1 className="mt-1 text-2xl font-light tracking-wide">
            Fechamento de {formatarData(f.data)} <span className="text-grafite/45">· {diaSemana(f.data)}</span>
          </h1>
        </div>
        <Selo tom={TOM_STATUS_FECHAMENTO[f.status]}>{ROTULO_STATUS_FECHAMENTO[f.status]}</Selo>
      </div>

      <FormularioFechamento
        fechamento={f}
        formas={formasExibidas}
        itens={(itens ?? []) as FechamentoItem[]}
        movimentos={(movimentos ?? []) as MovimentoCaixa[]}
        papel={perfil.papel}
        podeConferir={podeConferir(perfil.papel)}
        podeExcluir={f.criado_por === perfil.id || perfil.papel !== "operacao"}
        urlComprovante={urlComprovante}
      />

      <dl className="mb-24 mt-8 grid gap-x-6 gap-y-2 text-xs text-grafite/55 sm:grid-cols-3">
        <div>
          <dt className="uppercase tracking-wider">Lançado por</dt>
          <dd className="text-grafite/80">{nome(f.criado_por)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wider">Enviado</dt>
          <dd className="text-grafite/80">{f.enviado_em ? `${nome(f.enviado_por)} · ${formatarDataHora(f.enviado_em)}` : "—"}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wider">Conferido</dt>
          <dd className="text-grafite/80">{f.conferido_em ? `${nome(f.conferido_por)} · ${formatarDataHora(f.conferido_em)}` : "—"}</dd>
        </div>
        {reaberturas?.map((r, i) => (
          <div key={i} className="sm:col-span-3">
            <dt className="uppercase tracking-wider">Reaberto em {formatarDataHora(r.criado_em)}</dt>
            <dd className="text-grafite/80">{r.motivo}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
