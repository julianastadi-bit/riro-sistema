"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Aviso, Botao, Cartao, Selo, TituloCartao } from "@/components/ui";
import { formatarData, formatarMes, formatarMoeda, formatarNumero } from "@/lib/formatacao";
import { analisarPlanilha, importarPlanilha } from "../actions";

export function Importador() {
  const [previa, analisar, analisando] = useActionState(analisarPlanilha, undefined);
  const [resultado, importar, importando] = useActionState(importarPlanilha, undefined);
  // O arquivo fica no estado: o React limpa o formulário após cada ação
  const [arquivo, setArquivo] = useState<File | null>(null);
  const enviar = (acao: (d: FormData) => void) => {
    if (!arquivo) return;
    const d = new FormData();
    d.set("planilha", arquivo);
    startTransition(() => acao(d));
  };
  const novas = previa?.total !== undefined ? previa.total - (previa.jaImportadas ?? 0) : 0;
  const ocupado = analisando || importando;

  return (
    <div className="space-y-5">
      <Cartao className="space-y-4 p-4 sm:p-5">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-cobre-200 bg-cobre-50/40 px-4 py-8 text-center hover:border-cobre-400">
          <FileSpreadsheet size={28} className="text-cobre-600" strokeWidth={1.5} />
          <span className="text-sm font-medium">{arquivo?.name || "Selecionar planilha FLUXO RIRO SALON (.xlsm / .xlsx)"}</span>
          <span className="text-xs text-grafite/55">Somente a aba PAGTO é lida. Nada é gravado antes da confirmação.</span>
          <input
            type="file"
            name="planilha"
            accept=".xlsm,.xlsx"
            className="sr-only"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
        </label>
        <Botao type="button" onClick={() => enviar(analisar)} disabled={ocupado || !arquivo} variante="secundario">
          {analisando ? "Lendo planilha…" : "Analisar"}
        </Botao>
      </Cartao>

      {previa?.erro && <Aviso tom="vermelho">{previa.erro}</Aviso>}

      {previa?.total !== undefined && !resultado?.inseridas && !resultado?.existentes && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Resumo rotulo="Lançamentos" valor={formatarNumero(previa.total).replace(",00", "")} />
            <Resumo rotulo="Valor total" valor={formatarMoeda(previa.valorTotal)} />
            <Resumo rotulo="Marcados como pagos" valor={String(previa.pagas)} />
            <Resumo rotulo="Novos para importar" valor={String(novas)} detalhe={previa.jaImportadas ? `${previa.jaImportadas} já estão no sistema` : undefined} />
          </div>

          {previa.pagasSemBanco ? (
            <Aviso>{previa.pagasSemBanco} lançamento(s) com “OK” sem banco informado vão entrar em aberto, para você dar baixa no sistema.</Aviso>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            <Cartao>
              <TituloCartao>Por categoria</TituloCartao>
              <ul className="divide-y divide-linha/70 text-sm">
                {previa.porCategoria?.map((c) => (
                  <li key={c.categoria} className="flex items-center gap-3 px-4 py-2 sm:px-5">
                    <span className="min-w-0 flex-1 truncate">{c.categoria}</span>
                    {c.codigo ? <span className="text-xs text-grafite/45">→ {c.codigo}</span> : <Selo tom="amarelo">a classificar</Selo>}
                    <span className="num w-28 text-right">{formatarNumero(c.valor)}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
            <div className="space-y-5">
              <Cartao>
                <TituloCartao>Por mês de vencimento</TituloCartao>
                <ul className="divide-y divide-linha/70 text-sm">
                  {previa.porMes?.map((m) => (
                    <li key={m.mes} className="flex gap-3 px-4 py-2 sm:px-5">
                      <span className="flex-1">{formatarMes(`${m.mes}-01`)}</span>
                      <span className="text-grafite/50">{m.qtd}</span>
                      <span className="num w-28 text-right">{formatarNumero(m.valor)}</span>
                    </li>
                  ))}
                </ul>
              </Cartao>
              <Cartao>
                <TituloCartao>Por empresa</TituloCartao>
                <ul className="divide-y divide-linha/70 text-sm">
                  {previa.porEmpresa?.map((m) => (
                    <li key={m.empresa} className="flex gap-3 px-4 py-2 sm:px-5">
                      <span className="flex-1">{m.empresa}</span>
                      <span className="text-grafite/50">{m.qtd}</span>
                      <span className="num w-28 text-right">{formatarNumero(m.valor)}</span>
                    </li>
                  ))}
                </ul>
              </Cartao>
            </div>
          </div>

          <Cartao>
            <TituloCartao>Primeiras linhas</TituloCartao>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-grafite/50">
                  <tr className="border-b border-linha">
                    <th className="px-4 py-2 font-medium sm:px-5">Linha</th>
                    <th className="px-2 py-2 font-medium">Fornecedor</th>
                    <th className="px-2 py-2 font-medium">Vencimento</th>
                    <th className="px-2 py-2 text-right font-medium">Valor</th>
                    <th className="px-4 py-2 font-medium sm:px-5">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha/70">
                  {previa.amostra?.map((a) => (
                    <tr key={a.linha}>
                      <td className="px-4 py-2 text-grafite/45 sm:px-5">{a.linha}</td>
                      <td className="px-2 py-2"><span className="block">{a.fornecedor}</span><span className="text-xs text-grafite/50">{a.descricao}</span></td>
                      <td className="num px-2 py-2">{formatarData(a.vencimento)}</td>
                      <td className="num px-2 py-2 text-right">{formatarNumero(a.valor)}</td>
                      <td className="px-4 py-2 sm:px-5">{a.pago ? <Selo tom="verde">Paga</Selo> : <Selo tom="azul">Em aberto</Selo>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>

          {previa.ignoradas?.length ? (
            <Aviso>{previa.ignoradas.length} linha(s) ignoradas: {previa.ignoradas.slice(0, 5).map((i) => `linha ${i.linha} (${i.motivo})`).join("; ")}</Aviso>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Botao type="button" onClick={() => enviar(importar)} disabled={ocupado || novas === 0}>
              {importando ? "Importando…" : novas ? `Importar ${novas} lançamentos` : "Nada novo para importar"}
            </Botao>
            <span className="text-xs text-grafite/55">Pode importar de novo depois: o que já entrou é reconhecido e não duplica.</span>
          </div>
        </>
      )}

      {resultado?.erro && <Aviso tom="vermelho">{resultado.erro}</Aviso>}
      {resultado && !resultado.erro && (
        <Cartao className="space-y-3 p-4 sm:p-5">
          <p className="text-lg font-light">Importação concluída</p>
          <ul className="space-y-1 text-sm">
            <li><strong className="font-medium">{resultado.inseridas}</strong> contas importadas, sendo <strong className="font-medium">{resultado.pagas}</strong> já baixadas como pagas</li>
            <li><strong className="font-medium">{resultado.novos_fornecedores}</strong> fornecedores cadastrados automaticamente</li>
            {resultado.existentes ? <li>{resultado.existentes} já estavam no sistema e foram ignoradas</li> : null}
          </ul>
          {resultado.avisos?.length ? (
            <Aviso>
              <p className="mb-1 font-medium">{resultado.avisos.length} aviso(s)</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {resultado.avisos.slice(0, 10).map((a, i) => <li key={i}>Linha {a.linha}: {a.aviso}</li>)}
              </ul>
            </Aviso>
          ) : null}
          <Link href="/pagar" className="inline-block text-sm font-medium text-cobre-700 hover:underline">Ver contas a pagar →</Link>
        </Cartao>
      )}
    </div>
  );
}

function Resumo({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <Cartao className="p-4">
      <p className="text-xs uppercase tracking-wider text-grafite/55">{rotulo}</p>
      <p className="num mt-1 text-xl font-light">{valor}</p>
      {detalhe && <p className="text-xs text-grafite/55">{detalhe}</p>}
    </Cartao>
  );
}
