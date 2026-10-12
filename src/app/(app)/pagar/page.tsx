import { FileSpreadsheet, Plus } from "lucide-react";
import { Aviso, Botao, BotaoLink, Cabecalho, Cartao, Entrada, Indicador, Selecao } from "@/components/ui";
import { exigirPerfil, podeConferir } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarMoeda, hojeSP, somar, somarDias } from "@/lib/formatacao";
import type { ContaFinanceira } from "@/lib/tipos";
import { ListaContas, type LinhaConta } from "./ListaContas";

export const metadata = { title: "Contas a pagar" };

const SITUACOES = [
  { id: "abertas", rotulo: "Em aberto" },
  { id: "pagas", rotulo: "Pagas no período" },
  { id: "canceladas", rotulo: "Canceladas" },
  { id: "todas", rotulo: "Todas" },
];

export default async function PaginaPagar({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; situacao?: string; empresa?: string; categoria?: string; busca?: string; criadas?: string }>;
}) {
  const perfil = await exigirPerfil("gerente", "financeiro", "admin");
  const sp = await searchParams;
  const hoje = hojeSP();
  const de = sp.de || `${hoje.slice(0, 7)}-01`;
  const ate = sp.ate || somarDias(hoje, 30);
  const situacao = SITUACOES.some((s) => s.id === sp.situacao) ? sp.situacao! : "abertas";
  const supabase = await criarClienteServidor();

  const [{ data: empresas }, { data: categorias }, { data: contasFin }] = await Promise.all([
    supabase.from("empresas").select("id, nome").eq("ativo", true).order("principal", { ascending: false }),
    supabase.from("plano_contas").select("id, codigo, nome").neq("tipo", "receita").eq("ativo", true).order("ordem"),
    supabase.from("contas_financeiras").select("*").eq("ativo", true).order("nome"),
  ]);

  let consulta = supabase
    .from("contas_pagar")
    .select(
      "id, empresa_id, descricao, documento, forma, competencia, data_vencimento, valor, parcela, total_parcelas, status, data_pagamento, valor_pago, conta_pagamento_id, origem, fornecedor:fornecedores(nome), plano:plano_contas(codigo, nome), empresa:empresas(nome), conta:contas_financeiras(nome, empresa_id)",
    )
    .order("data_vencimento")
    .order("valor", { ascending: false })
    .limit(2000);

  if (situacao === "abertas") consulta = consulta.eq("status", "aberto").lte("data_vencimento", ate);
  else if (situacao === "pagas") consulta = consulta.eq("status", "pago").gte("data_pagamento", de).lte("data_pagamento", ate);
  else if (situacao === "canceladas") consulta = consulta.eq("status", "cancelado").gte("data_vencimento", de).lte("data_vencimento", ate);
  else consulta = consulta.gte("data_vencimento", de).lte("data_vencimento", ate);
  if (sp.empresa) consulta = consulta.eq("empresa_id", sp.empresa);
  if (sp.categoria) consulta = consulta.eq("plano_conta_id", sp.categoria);

  const { data } = await consulta;
  let linhas = (data ?? []) as unknown as LinhaConta[];
  const busca = (sp.busca ?? "").trim().toLowerCase();
  if (busca) {
    linhas = linhas.filter((l) =>
      [l.fornecedor?.nome, l.descricao, l.documento].some((t) => t?.toLowerCase().includes(busca)),
    );
  }

  // Indicadores (independentes dos filtros)
  const [{ data: abertas }, { data: pagasMes }] = await Promise.all([
    supabase.from("contas_pagar").select("data_vencimento, valor").eq("status", "aberto").lte("data_vencimento", somarDias(hoje, 7)).limit(5000),
    supabase.from("contas_pagar").select("valor_pago").eq("status", "pago").gte("data_pagamento", `${hoje.slice(0, 7)}-01`).limit(5000),
  ]);
  const vencidas = (abertas ?? []).filter((c) => c.data_vencimento < hoje);
  const deHoje = (abertas ?? []).filter((c) => c.data_vencimento === hoje);
  const proximas = (abertas ?? []).filter((c) => c.data_vencimento > hoje);
  const soma = (l: { valor: number }[]) => formatarMoeda(somar(l.map((c) => Number(c.valor))));

  const financeiro = podeConferir(perfil.papel);

  return (
    <>
      <Cabecalho
        titulo="Contas a pagar"
        subtitulo="Boletos, folha, impostos e fornecedores, por vencimento."
        acoes={
          financeiro && (
            <>
              <BotaoLink href="/pagar/importar" variante="secundario">
                <FileSpreadsheet size={16} /> Importar planilha
              </BotaoLink>
              <BotaoLink href="/pagar/nova">
                <Plus size={16} /> Nova conta
              </BotaoLink>
            </>
          )
        }
      />

      {sp.criadas && <div className="mb-4"><Aviso tom="verde">{sp.criadas} contas lançadas.</Aviso></div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Vencidas" valor={soma(vencidas)} detalhe={`${vencidas.length} conta(s) em atraso`} tom={vencidas.length ? "alerta" : undefined} />
        <Indicador rotulo="Vencem hoje" valor={soma(deHoje)} detalhe={`${deHoje.length} conta(s)`} />
        <Indicador rotulo="Próximos 7 dias" valor={soma(proximas)} detalhe={`${proximas.length} conta(s)`} />
        <Indicador
          rotulo="Pago no mês"
          valor={formatarMoeda(somar((pagasMes ?? []).map((c) => Number(c.valor_pago))))}
          detalhe={`${pagasMes?.length ?? 0} pagamento(s)`}
        />
      </div>

      <Cartao className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,1fr)_repeat(3,1fr)_auto] lg:items-end">
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-grafite/55">Situação</span>
            <Selecao name="situacao" defaultValue={situacao}>
              {SITUACOES.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
            </Selecao>
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-grafite/55">De</span>
            <Entrada type="date" name="de" defaultValue={de} />
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-grafite/55">Até</span>
            <Entrada type="date" name="ate" defaultValue={ate} />
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-grafite/55">Empresa</span>
            <Selecao name="empresa" defaultValue={sp.empresa ?? ""}>
              <option value="">Todas</option>
              {empresas?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Selecao>
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-grafite/55">Categoria</span>
            <Selecao name="categoria" defaultValue={sp.categoria ?? ""}>
              <option value="">Todas</option>
              {categorias?.map((c) => <option key={c.id} value={c.id}>{c.codigo} {c.nome}</option>)}
            </Selecao>
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-grafite/55">Buscar</span>
            <Entrada name="busca" placeholder="Fornecedor, descrição…" defaultValue={sp.busca ?? ""} />
          </label>
          <Botao type="submit" variante="secundario">Filtrar</Botao>
        </form>
        {situacao === "abertas" && (
          <p className="mt-3 text-xs text-grafite/50">Em aberto mostra tudo que vence até a data final, inclusive o que já venceu.</p>
        )}
      </Cartao>

      <ListaContas
        linhas={linhas}
        hoje={hoje}
        podePagar={financeiro}
        contas={(contasFin ?? []) as ContaFinanceira[]}
        empresas={empresas ?? []}
      />
    </>
  );
}

