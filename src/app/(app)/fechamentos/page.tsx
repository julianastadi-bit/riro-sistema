import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { BotaoLink, Cabecalho, Cartao, Selo, cx } from "@/components/ui";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { diaSemana, formatarData, formatarNumero, hojeSP, somarDias } from "@/lib/formatacao";
import type { Empresa, StatusFechamento } from "@/lib/tipos";
import { ROTULO_STATUS_FECHAMENTO, TOM_STATUS_FECHAMENTO } from "@/lib/tipos";

export const metadata = { title: "Fechamento de caixa" };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function deslocarMes(mes: string, delta: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function PaginaFechamentos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; empresa?: string }>;
}) {
  await exigirPerfil();
  const sp = await searchParams;
  const hoje = hojeSP();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : hoje.slice(0, 7);
  const supabase = await criarClienteServidor();

  const { data: empresasDados } = await supabase.from("empresas").select("*").eq("ativo", true).order("principal", { ascending: false });
  const empresas = (empresasDados ?? []) as Empresa[];
  const empresa = empresas.find((e) => e.id === sp.empresa) ?? empresas[0];

  const inicio = `${mes}-01`;
  const fim = somarDias(`${deslocarMes(mes, 1)}-01`, -1);
  const { data: fechamentos } = empresa
    ? await supabase
        .from("fechamentos_caixa")
        .select("id, data, status, total_avec, dinheiro_contado, observacoes")
        .eq("empresa_id", empresa.id)
        .gte("data", inicio)
        .lte("data", fim)
    : { data: [] };

  const porData = new Map((fechamentos ?? []).map((f) => [f.data as string, f]));
  const ultimoDia = fim < hoje ? fim : hoje;
  const dias: string[] = [];
  for (let d = ultimoDia; d >= inicio; d = somarDias(d, -1)) dias.push(d);
  // Fechamentos lançados para datas futuras (não deveria acontecer, mas não podem sumir da lista)
  for (const f of fechamentos ?? []) if (f.data > ultimoDia) dias.unshift(f.data);

  const totalMes = (fechamentos ?? []).reduce((s, f) => s + Number(f.total_avec ?? 0), 0);
  const [ano, m] = mes.split("-").map(Number);
  const qs = (novoMes: string) => `?mes=${novoMes}${empresa ? `&empresa=${empresa.id}` : ""}`;

  return (
    <>
      <Cabecalho
        titulo="Fechamento de caixa"
        subtitulo="Um lançamento por dia, copiado do fechamento do Avec."
        acoes={
          <BotaoLink href={`/fechamentos/novo${empresa ? `?empresa=${empresa.id}` : ""}`}>
            <Plus size={16} /> Lançar fechamento
          </BotaoLink>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={qs(deslocarMes(mes, -1))} className="rounded-lg p-2 hover:bg-cobre-50" aria-label="Mês anterior">
            <ChevronLeft size={18} />
          </Link>
          <span className="min-w-36 text-center text-sm font-medium capitalize">
            {MESES[m - 1]} {ano}
          </span>
          <Link href={qs(deslocarMes(mes, 1))} className="rounded-lg p-2 hover:bg-cobre-50" aria-label="Próximo mês">
            <ChevronRight size={18} />
          </Link>
        </div>
        {empresas.length > 1 && (
          <div className="flex rounded-lg border border-linha bg-white p-0.5">
            {empresas.map((e) => (
              <Link
                key={e.id}
                href={`?mes=${mes}&empresa=${e.id}`}
                className={cx(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  e.id === empresa?.id ? "bg-cobre-600 text-white" : "text-grafite/70 hover:text-grafite",
                )}
              >
                {e.nome}
              </Link>
            ))}
          </div>
        )}
      </div>

      <Cartao>
        <div className="flex items-center justify-between border-b border-linha px-4 py-3 text-sm sm:px-5">
          <span className="text-grafite/60">
            {porData.size} fechamento(s) no mês
          </span>
          <span>
            Total faturado: <strong className="num font-medium">R$ {formatarNumero(totalMes)}</strong>
          </span>
        </div>
        {dias.length === 0 && <p className="px-5 py-10 text-center text-sm text-grafite/50">Mês ainda não começou.</p>}
        <ul className="divide-y divide-linha">
          {dias.map((d) => {
            const f = porData.get(d);
            const domingo = diaSemana(d) === "dom";
            return (
              <li key={d}>
                {f ? (
                  <Link href={`/fechamentos/${f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cobre-50/50 sm:px-5">
                    <DataDia iso={d} />
                    <Selo tom={TOM_STATUS_FECHAMENTO[f.status as StatusFechamento]}>
                      {ROTULO_STATUS_FECHAMENTO[f.status as StatusFechamento]}
                    </Selo>
                    <span className="num ml-auto text-sm">
                      {f.total_avec === null ? "—" : `R$ ${formatarNumero(Number(f.total_avec))}`}
                    </span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <DataDia iso={d} apagado />
                    <span className={cx("text-xs", domingo ? "text-grafite/35" : "text-amber-700")}>
                      Sem lançamento
                    </span>
                    {empresa && (
                      <Link
                        href={`/fechamentos/novo?empresa=${empresa.id}&data=${d}`}
                        className="ml-auto text-xs font-medium text-cobre-700 hover:underline"
                      >
                        Lançar
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Cartao>
    </>
  );
}

function DataDia({ iso, apagado }: { iso: string; apagado?: boolean }) {
  return (
    <span className={cx("flex w-28 items-baseline gap-2 text-sm", apagado && "text-grafite/45")}>
      <span className="num">{formatarData(iso).slice(0, 5)}</span>
      <span className="text-xs uppercase text-grafite/45">{diaSemana(iso)}</span>
    </span>
  );
}
