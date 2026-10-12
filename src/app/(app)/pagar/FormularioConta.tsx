"use client";

import { useActionState, useMemo, useState } from "react";
import { AreaTexto, Aviso, Botao, Cartao, Entrada, Selecao, cx } from "@/components/ui";
import { formatarData, formatarMes, formatarNumero, lerValor, somarMeses } from "@/lib/formatacao";
import type { ContaPagar, FormaDespesa, Fornecedor, PlanoConta } from "@/lib/tipos";
import { ROTULO_FORMA_DESPESA } from "@/lib/tipos";
import { salvarContaPagar } from "./actions";

interface Props {
  conta?: ContaPagar & { fornecedor_nome: string };
  empresas: { id: string; nome: string }[];
  fornecedores: Pick<Fornecedor, "id" | "nome" | "plano_conta_id" | "forma_padrao">[];
  categorias: PlanoConta[];
  hoje: string;
}

const Campo = ({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) => (
  <label className={cx("block space-y-1.5", className)}>
    <span className="block text-xs font-medium uppercase tracking-wider text-grafite/60">{rotulo}</span>
    {children}
  </label>
);

export function FormularioConta({ conta, empresas, fornecedores, categorias, hoje }: Props) {
  const [estado, acao, pendente] = useActionState(salvarContaPagar, undefined);
  const [fornecedor, setFornecedor] = useState(conta?.fornecedor_nome ?? "");
  const [categoria, setCategoria] = useState(conta?.plano_conta_id ?? "");
  const [forma, setForma] = useState<FormaDespesa>(conta?.forma ?? "boleto");
  const [vencimento, setVencimento] = useState(conta?.data_vencimento ?? hoje);
  const [competencia, setCompetencia] = useState((conta?.competencia ?? hoje).slice(0, 7));
  const [competenciaTocada, setCompetenciaTocada] = useState(!!conta);
  const [valor, setValor] = useState(conta ? formatarNumero(conta.valor) : "");
  const [modo, setModo] = useState<"unica" | "parcelada" | "recorrente">("unica");
  const [vezes, setVezes] = useState("3");

  const conhecido = fornecedores.find((f) => f.nome.trim().toUpperCase() === fornecedor.trim().toUpperCase());

  const escolherFornecedor = (nome: string) => {
    setFornecedor(nome);
    const f = fornecedores.find((x) => x.nome.trim().toUpperCase() === nome.trim().toUpperCase());
    if (f?.plano_conta_id && !categoria) setCategoria(f.plano_conta_id);
    if (f?.forma_padrao && !conta) setForma(f.forma_padrao);
  };

  const grupos = useMemo(() => {
    const m = new Map<string, PlanoConta[]>();
    categorias.forEach((c) => m.set(c.grupo, [...(m.get(c.grupo) ?? []), c]));
    return [...m.entries()];
  }, [categorias]);

  const previa = useMemo(() => {
    const v = lerValor(valor);
    const n = parseInt(vezes, 10);
    if (conta || modo === "unica" || !v || !(n >= 2) || n > 60) return [];
    const centavos = Math.round(v * 100);
    const parte = Math.floor(centavos / n);
    return Array.from({ length: n }, (_, i) => ({
      vencimento: somarMeses(vencimento, i),
      competencia: somarMeses(`${competencia}-01`, i),
      valor: modo === "parcelada" ? (i === 0 ? centavos - parte * (n - 1) : parte) / 100 : v,
    }));
  }, [valor, vezes, modo, vencimento, competencia, conta]);

  return (
    <form action={acao} className="space-y-5">
      {conta && <input type="hidden" name="id" value={conta.id} />}
      {estado?.erro && <Aviso tom="vermelho">{estado.erro}</Aviso>}
      {estado?.ok && <Aviso tom="verde">{estado.ok}</Aviso>}

      <Cartao className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Campo rotulo="Fornecedor" className="sm:col-span-2">
          <Entrada
            name="fornecedor"
            list="lista-fornecedores"
            value={fornecedor}
            onChange={(e) => escolherFornecedor(e.target.value)}
            placeholder="Digite para buscar ou cadastrar"
            autoComplete="off"
            required
          />
          <datalist id="lista-fornecedores">
            {fornecedores.map((f) => <option key={f.id} value={f.nome} />)}
          </datalist>
          {fornecedor.trim() && !conhecido && (
            <span className="block text-xs text-cobre-700">Novo fornecedor: será cadastrado ao salvar.</span>
          )}
        </Campo>
        <Campo rotulo="Descrição" className="sm:col-span-2">
          <Entrada name="descricao" defaultValue={conta?.descricao} placeholder="Ex.: Energia do salão · outubro" required />
        </Campo>
        <Campo rotulo="Categoria (DRE)">
          <Selecao name="plano_conta_id" value={categoria} onChange={(e) => setCategoria(e.target.value)} required>
            <option value="">Selecione…</option>
            {grupos.map(([g, itens]) => (
              <optgroup key={g} label={g}>
                {itens.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}
              </optgroup>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Empresa">
          <Selecao name="empresa_id" defaultValue={conta?.empresa_id ?? empresas[0]?.id} required>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Forma de pagamento">
          <Selecao name="forma" value={forma} onChange={(e) => setForma(e.target.value as FormaDespesa)}>
            {Object.entries(ROTULO_FORMA_DESPESA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Nº documento / NF">
          <Entrada name="documento" defaultValue={conta?.documento ?? ""} />
        </Campo>
      </Cartao>

      <Cartao className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
        <Campo rotulo={modo === "parcelada" ? "Valor total" : "Valor"}>
          <Entrada
            name="valor"
            inputMode="decimal"
            className="num text-right"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => {
              const v = lerValor(valor);
              setValor(v === null ? "" : formatarNumero(v));
            }}
            required
          />
        </Campo>
        <Campo rotulo={modo === "unica" || conta ? "Vencimento" : "1º vencimento"}>
          <Entrada
            type="date"
            name="data_vencimento"
            value={vencimento}
            onChange={(e) => {
              setVencimento(e.target.value);
              if (!competenciaTocada && e.target.value) setCompetencia(e.target.value.slice(0, 7));
            }}
            required
          />
        </Campo>
        <Campo rotulo="Competência (mês da DRE)">
          <Entrada
            type="month"
            name="competencia"
            value={competencia}
            onChange={(e) => {
              setCompetencia(e.target.value);
              setCompetenciaTocada(true);
            }}
            required
          />
        </Campo>

        {!conta && (
          <div className="space-y-3 sm:col-span-3">
            <div className="flex flex-wrap gap-1 rounded-lg border border-linha bg-creme p-0.5 text-xs font-medium sm:w-max">
              {([["unica", "Única"], ["parcelada", "Parcelada"], ["recorrente", "Recorrente mensal"]] as const).map(([v, r]) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setModo(v)}
                  className={cx("rounded-md px-3 py-1.5", modo === v ? "bg-cobre-600 text-white" : "text-grafite/70 hover:text-grafite")}
                >
                  {r}
                </button>
              ))}
            </div>
            <input type="hidden" name="modo" value={modo} />
            {modo !== "unica" && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>{modo === "parcelada" ? "Dividir em" : "Repetir por"}</span>
                <Entrada name="vezes" inputMode="numeric" value={vezes} onChange={(e) => setVezes(e.target.value.replace(/\D/g, ""))} className="num w-20 text-center" />
                <span>{modo === "parcelada" ? "parcelas mensais" : "meses"}</span>
              </div>
            )}
            {previa.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-linha">
                <table className="w-full text-sm">
                  <thead className="bg-creme text-left text-[11px] uppercase tracking-wider text-grafite/50">
                    <tr><th className="px-3 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Vencimento</th><th className="px-3 py-2 font-medium">Competência</th><th className="px-3 py-2 text-right font-medium">Valor</th></tr>
                  </thead>
                  <tbody className="divide-y divide-linha/70">
                    {previa.map((p, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-grafite/50">{i + 1}</td>
                        <td className="num px-3 py-1.5">{formatarData(p.vencimento)}</td>
                        <td className="px-3 py-1.5">{formatarMes(p.competencia)}</td>
                        <td className="num px-3 py-1.5 text-right">{formatarNumero(p.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Cartao>

      <Cartao className="grid gap-4 p-4 sm:p-5">
        <Campo rotulo="Código de barras / linha digitável">
          <Entrada name="codigo_barras" defaultValue={conta?.codigo_barras ?? ""} inputMode="numeric" className="num" />
        </Campo>
        <Campo rotulo="Observações">
          <AreaTexto name="observacoes" rows={2} defaultValue={conta?.observacoes ?? ""} />
        </Campo>
      </Cartao>

      <div className="flex gap-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : conta ? "Salvar alterações" : previa.length ? `Lançar ${previa.length} contas` : "Lançar conta"}
        </Botao>
      </div>
    </form>
  );
}
