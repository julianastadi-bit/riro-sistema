import Link from "next/link";
import { Cabecalho, Cartao, Entrada, Indicador, Selecao, Selo, Vazio, Botao } from "@/components/ui";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarData, formatarMoeda, formatarNumero, hojeSP, somar, somarDias } from "@/lib/formatacao";
import type { Destino, StatusRecebivel } from "@/lib/tipos";
import { ROTULO_DESTINO, ROTULO_STATUS_RECEBIVEL } from "@/lib/tipos";

export const metadata = { title: "Contas a receber" };

const tomStatus: Record<StatusRecebivel, "azul" | "verde" | "vermelho" | "neutro"> = {
  previsto: "azul",
  conciliado: "verde",
  divergente: "vermelho",
  cancelado: "neutro",
};

interface Linha {
  id: string;
  data_venda: string;
  data_prevista: string;
  destino: Destino;
  quantidade: number;
  valor_bruto: number;
  taxa_percentual: number;
  valor_taxa: number;
  valor_liquido: number;
  status: StatusRecebivel;
  fechamento_id: string;
  forma: { nome: string } | null;
  conta: { nome: string } | null;
  empresa: { nome: string } | null;
}

export default async function PaginaRecebiveis({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; status?: string; destino?: string; empresa?: string }>;
}) {
  await exigirPerfil("gerente", "financeiro", "admin");
  const sp = await searchParams;
  const hoje = hojeSP();
  const de = sp.de || `${hoje.slice(0, 7)}-01`;
  const ate = sp.ate || somarDias(hoje, 30);
  const status = sp.status ?? "previsto";
  const supabase = await criarClienteServidor();

  const { data: empresas } = await supabase.from("empresas").select("id, nome").eq("ativo", true).order("principal", { ascending: false });

  let consulta = supabase
    .from("recebiveis")
    .select(
      "id, data_venda, data_prevista, destino, quantidade, valor_bruto, taxa_percentual, valor_taxa, valor_liquido, status, fechamento_id, forma:formas_pagamento(nome), conta:contas_financeiras(nome), empresa:empresas(nome)",
    )
    .gte("data_prevista", de)
    .lte("data_prevista", ate)
    .order("data_prevista")
    .order("valor_bruto", { ascending: false })
    .limit(1000);
  if (status !== "todos") consulta = consulta.eq("status", status);
  if (sp.destino) consulta = consulta.eq("destino", sp.destino);
  if (sp.empresa) consulta = consulta.eq("empresa_id", sp.empresa);
  const { data } = await consulta;
  const linhas = (data ?? []) as unknown as Linha[];

  // Indicadores independentes do filtro de período
  const { data: abertos } = await supabase
    .from("recebiveis")
    .select("data_prevista, valor_liquido")
    .eq("status", "previsto")
    .limit(5000);
  const atrasados = (abertos ?? []).filter((r) => r.data_prevista < hoje);
  const proximos7 = (abertos ?? []).filter((r) => r.data_prevista >= hoje && r.data_prevista <= somarDias(hoje, 7));

  const total = (campo: "valor_bruto" | "valor_taxa" | "valor_liquido") => somar(linhas.map((l) => Number(l[campo])));

  return (
    <>
      <Cabecalho
        titulo="Contas a receber"
        subtitulo="Gerado automaticamente a cada fechamento enviado. A baixa virá da conciliação com Safrapay, banco e cofre."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador
          rotulo="Em aberto"
          valor={formatarMoeda(somar((abertos ?? []).map((r) => Number(r.valor_liquido))))}
          detalhe={`${abertos?.length ?? 0} recebíveis previstos (líquido)`}
        />
        <Indicador
          rotulo="Próximos 7 dias"
          valor={formatarMoeda(somar(proximos7.map((r) => Number(r.valor_liquido))))}
          detalhe="Previsão de entrada"
        />
        <Indicador
          rotulo="Atrasados sem conciliação"
          valor={formatarMoeda(somar(atrasados.map((r) => Number(r.valor_liquido))))}
          detalhe={`${atrasados.length} com data prevista vencida`}
          tom={atrasados.length ? "alerta" : undefined}
        />
      </div>

      <Cartao className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,1fr)_auto] lg:items-end">
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-grafite/55">Previsto de</span>
            <Entrada type="date" name="de" defaultValue={de} />
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-grafite/55">até</span>
            <Entrada type="date" name="ate" defaultValue={ate} />
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-grafite/55">Status</span>
            <Selecao name="status" defaultValue={status}>
              <option value="todos">Todos</option>
              {Object.entries(ROTULO_STATUS_RECEBIVEL).map(([v, r]) => (
                <option key={v} value={v}>{r}</option>
              ))}
            </Selecao>
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-grafite/55">Destino</span>
            <Selecao name="destino" defaultValue={sp.destino ?? ""}>
              <option value="">Todos</option>
              {Object.entries(ROTULO_DESTINO).map(([v, r]) => (
                <option key={v} value={v}>{r}</option>
              ))}
            </Selecao>
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-grafite/55">Empresa</span>
            <Selecao name="empresa" defaultValue={sp.empresa ?? ""}>
              <option value="">Todas</option>
              {empresas?.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </Selecao>
          </label>
          <Botao type="submit" variante="secundario">Filtrar</Botao>
        </form>
      </Cartao>

      <Cartao>
        <div className="grid grid-cols-3 gap-2 border-b border-linha px-4 py-3 text-sm sm:px-5">
          <span>Bruto <strong className="num block font-medium">{formatarMoeda(total("valor_bruto"))}</strong></span>
          <span>Taxas <strong className="num block font-medium text-red-700">{formatarMoeda(total("valor_taxa"))}</strong></span>
          <span>Líquido <strong className="num block font-medium">{formatarMoeda(total("valor_liquido"))}</strong></span>
        </div>
        {linhas.length === 0 ? (
          <Vazio>Nenhum recebível no filtro selecionado.</Vazio>
        ) : (
          <>
            {/* Tabela (desktop) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-grafite/50">
                  <tr className="border-b border-linha">
                    <th className="px-5 py-2 font-medium">Previsto</th>
                    <th className="px-2 py-2 font-medium">Forma</th>
                    <th className="px-2 py-2 font-medium">Destino</th>
                    <th className="px-2 py-2 font-medium">Venda</th>
                    <th className="px-2 py-2 text-right font-medium">Bruto</th>
                    <th className="px-2 py-2 text-right font-medium">Taxa</th>
                    <th className="px-2 py-2 text-right font-medium">Líquido</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha/70">
                  {linhas.map((l) => (
                    <tr key={l.id} className={l.status === "previsto" && l.data_prevista < hoje ? "bg-red-50/40" : undefined}>
                      <td className="num px-5 py-2.5">{formatarData(l.data_prevista)}</td>
                      <td className="px-2 py-2.5">
                        {l.forma?.nome}
                        {l.quantidade > 0 && <span className="text-grafite/45"> ({l.quantidade})</span>}
                      </td>
                      <td className="px-2 py-2.5 text-grafite/70">{l.conta?.nome ?? ROTULO_DESTINO[l.destino]}</td>
                      <td className="num px-2 py-2.5">
                        <Link href={`/fechamentos/${l.fechamento_id}`} className="text-cobre-700 hover:underline">
                          {formatarData(l.data_venda)}
                        </Link>
                      </td>
                      <td className="num px-2 py-2.5 text-right">{formatarNumero(l.valor_bruto)}</td>
                      <td className="num px-2 py-2.5 text-right text-grafite/60">
                        {Number(l.valor_taxa) ? formatarNumero(l.valor_taxa) : "—"}
                      </td>
                      <td className="num px-2 py-2.5 text-right font-medium">{formatarNumero(l.valor_liquido)}</td>
                      <td className="px-5 py-2.5"><Selo tom={tomStatus[l.status]}>{ROTULO_STATUS_RECEBIVEL[l.status]}</Selo></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Cartões (celular) */}
            <ul className="divide-y divide-linha md:hidden">
              {linhas.map((l) => (
                <li key={l.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{l.forma?.nome}</span>
                    <span className="num text-sm font-medium">{formatarMoeda(l.valor_liquido)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-grafite/60">
                    <span>
                      Prev. {formatarData(l.data_prevista)} · venda {formatarData(l.data_venda)}
                    </span>
                    <Selo tom={tomStatus[l.status]}>{ROTULO_STATUS_RECEBIVEL[l.status]}</Selo>
                  </div>
                  <div className="mt-0.5 text-xs text-grafite/50">
                    {l.conta?.nome ?? ROTULO_DESTINO[l.destino]} · bruto {formatarNumero(l.valor_bruto)}
                    {Number(l.valor_taxa) > 0 && ` · taxa ${formatarNumero(l.valor_taxa)}`}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Cartao>
    </>
  );
}
