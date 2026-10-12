"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Aviso, Botao, Cartao, Entrada, Selecao, Selo, Vazio, cx } from "@/components/ui";
import { diaSemana, formatarData, formatarMoeda, formatarNumero, somar } from "@/lib/formatacao";
import type { ContaFinanceira, FormaDespesa, StatusContaPagar } from "@/lib/tipos";
import { ROTULO_FORMA_DESPESA, ROTULO_SITUACAO, TOM_SITUACAO, situacaoConta } from "@/lib/tipos";
import { pagarContas, type Resultado } from "./actions";

export interface LinhaConta {
  id: string;
  empresa_id: string;
  descricao: string;
  documento: string | null;
  forma: FormaDespesa;
  competencia: string;
  data_vencimento: string;
  valor: number;
  parcela: number | null;
  total_parcelas: number | null;
  status: StatusContaPagar;
  data_pagamento: string | null;
  valor_pago: number | null;
  conta_pagamento_id: string | null;
  origem: string;
  fornecedor: { nome: string } | null;
  plano: { codigo: string; nome: string } | null;
  empresa: { nome: string } | null;
  conta: { nome: string; empresa_id: string } | null;
}

interface Props {
  linhas: LinhaConta[];
  hoje: string;
  podePagar: boolean;
  contas: ContaFinanceira[];
  empresas: { id: string; nome: string }[];
}

export function ListaContas({ linhas, hoje, podePagar, contas, empresas }: Props) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [dataPg, setDataPg] = useState(hoje);
  const [contaPg, setContaPg] = useState("");
  const [msg, setMsg] = useState<Resultado>({});
  const [pendente, iniciar] = useTransition();
  const variasEmpresas = empresas.length > 1;
  const nomeEmpresa = (id: string) => empresas.find((e) => e.id === id)?.nome ?? "";

  const grupos = useMemo(() => {
    const m = new Map<string, LinhaConta[]>();
    for (const l of linhas) {
      // pagas agrupam pela data do pagamento; demais pelo vencimento
      const chave = l.status === "pago" && l.data_pagamento ? l.data_pagamento : l.data_vencimento;
      m.set(chave, [...(m.get(chave) ?? []), l]);
    }
    return [...m.entries()];
  }, [linhas]);

  const abertas = linhas.filter((l) => l.status === "aberto");
  const totalSel = somar(linhas.filter((l) => selecionadas.has(l.id)).map((l) => Number(l.valor)));
  const total = somar(linhas.map((l) => Number(l.status === "pago" ? l.valor_pago ?? l.valor : l.valor)));

  const alternar = (id: string) =>
    setSelecionadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const alternarDia = (itens: LinhaConta[]) => {
    const ids = itens.filter((i) => i.status === "aberto").map((i) => i.id);
    const todas = ids.every((id) => selecionadas.has(id));
    setSelecionadas((s) => {
      const n = new Set(s);
      ids.forEach((id) => (todas ? n.delete(id) : n.add(id)));
      return n;
    });
  };

  const pagar = () => {
    setMsg({});
    iniciar(async () => {
      const r = await pagarContas([...selecionadas], dataPg, contaPg);
      setMsg(r);
      if (!r.erro) setSelecionadas(new Set());
    });
  };

  if (!linhas.length) return <Cartao><Vazio>Nenhuma conta no filtro selecionado.</Vazio></Cartao>;

  return (
    <div className={cx(selecionadas.size > 0 && "pb-36 sm:pb-24")}>
      {msg.erro && <div className="mb-4"><Aviso tom="vermelho">{msg.erro}</Aviso></div>}
      {msg.ok && <div className="mb-4"><Aviso tom="verde">{msg.ok}</Aviso></div>}

      <Cartao>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linha px-4 py-3 text-sm sm:px-5">
          <span className="text-grafite/60">
            {linhas.length} conta(s){abertas.length !== linhas.length && ` · ${abertas.length} em aberto`}
          </span>
          <span>Total <strong className="num font-medium">{formatarMoeda(total)}</strong></span>
        </div>

        {grupos.map(([dia, itens]) => {
          const abertasDia = itens.filter((i) => i.status === "aberto");
          const todasSel = abertasDia.length > 0 && abertasDia.every((i) => selecionadas.has(i.id));
          return (
            <div key={dia}>
              <div className={cx("flex items-center gap-3 border-b border-linha px-4 py-2 sm:px-5", dia < hoje && abertasDia.length ? "bg-red-50/60" : dia === hoje ? "bg-amber-50/60" : "bg-creme/70")}>
                {podePagar && abertasDia.length > 0 ? (
                  <input
                    type="checkbox"
                    aria-label={`Selecionar contas de ${formatarData(dia)}`}
                    checked={todasSel}
                    onChange={() => alternarDia(itens)}
                    className="size-4 accent-cobre-600"
                  />
                ) : (
                  podePagar && <span className="w-4" />
                )}
                <span className="num text-sm font-medium">{formatarData(dia)}</span>
                <span className="text-xs uppercase text-grafite/45">{dia === hoje ? "hoje" : diaSemana(dia)}</span>
                <span className="num ml-auto text-sm text-grafite/70">
                  {formatarNumero(somar(itens.map((i) => Number(i.status === "pago" ? i.valor_pago ?? i.valor : i.valor))))}
                </span>
              </div>
              <ul className="divide-y divide-linha/70">
                {itens.map((l) => {
                  const sit = situacaoConta(l, hoje);
                  const outraEmpresa = l.conta && l.conta.empresa_id !== l.empresa_id;
                  return (
                    <li key={l.id} className={cx("flex items-start gap-3 px-4 py-3 sm:px-5", selecionadas.has(l.id) && "bg-cobre-50")}>
                      {podePagar && (
                        l.status === "aberto" ? (
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${l.fornecedor?.nome}`}
                            checked={selecionadas.has(l.id)}
                            onChange={() => alternar(l.id)}
                            className="mt-1 size-4 shrink-0 accent-cobre-600"
                          />
                        ) : (
                          <span className="w-4 shrink-0" />
                        )
                      )}
                      <Link href={`/pagar/${l.id}`} className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{l.fornecedor?.nome}</p>
                          <p className="truncate text-xs text-grafite/60">
                            {l.descricao}
                            {l.parcela && l.total_parcelas && ` · parcela ${l.parcela}/${l.total_parcelas}`}
                          </p>
                          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-grafite/45">
                            <span>{l.plano?.nome}</span>
                            <span>· {ROTULO_FORMA_DESPESA[l.forma]}</span>
                            {variasEmpresas && <span>· {l.empresa?.nome ?? nomeEmpresa(l.empresa_id)}</span>}
                            {l.status === "pago" && l.conta && <span>· pago via {l.conta.nome}</span>}
                            {outraEmpresa && <span className="text-amber-700">· conta de outra empresa</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                          <span className="num text-sm font-medium">
                            {formatarNumero(l.status === "pago" ? l.valor_pago ?? l.valor : l.valor)}
                          </span>
                          <Selo tom={TOM_SITUACAO[sit]}>
                            {sit === "paga" && l.data_pagamento && l.data_pagamento !== dia
                              ? `Paga ${formatarData(l.data_pagamento).slice(0, 5)}`
                              : ROTULO_SITUACAO[sit]}
                          </Selo>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </Cartao>

      {podePagar && selecionadas.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-linha bg-white/95 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-3 px-4 py-3 sm:px-6 lg:px-10">
            <div className="mr-auto text-xs leading-tight text-grafite/60">
              <span className="block">{selecionadas.size} selecionada(s)</span>
              <span className="num text-base text-grafite">{formatarMoeda(totalSel)}</span>
            </div>
            <label className="space-y-1">
              <span className="block text-[11px] uppercase tracking-wider text-grafite/55">Pago em</span>
              <Entrada type="date" value={dataPg} max={hoje} onChange={(e) => setDataPg(e.target.value)} className="w-40" />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] uppercase tracking-wider text-grafite/55">Saiu da conta</span>
              <Selecao value={contaPg} onChange={(e) => setContaPg(e.target.value)} className="w-56">
                <option value="">Selecione…</option>
                {empresas.map((e) => (
                  <optgroup key={e.id} label={e.nome}>
                    {contas.filter((c) => c.empresa_id === e.id).map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </optgroup>
                ))}
              </Selecao>
            </label>
            <Botao variante="secundario" onClick={() => setSelecionadas(new Set())} disabled={pendente}>Limpar</Botao>
            <Botao onClick={pagar} disabled={pendente || !contaPg}>
              {pendente ? "Registrando…" : "Registrar pagamento"}
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
