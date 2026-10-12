import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Aviso, Cartao, Selo, TituloCartao, cx } from "@/components/ui";
import { exigirPerfil, podeConferir } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarData, formatarDataHora, formatarMes, formatarMoeda, hojeSP } from "@/lib/formatacao";
import type { ContaFinanceira, ContaPagar, Fornecedor, PlanoConta } from "@/lib/tipos";
import { ROTULO_FORMA_DESPESA, ROTULO_SITUACAO, TOM_SITUACAO, situacaoConta } from "@/lib/tipos";
import { FormularioConta } from "../FormularioConta";
import { AcoesConta } from "./AcoesConta";

export const metadata = { title: "Conta a pagar" };

export default async function PaginaConta({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ criada?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const perfil = await exigirPerfil("gerente", "financeiro", "admin");
  const supabase = await criarClienteServidor();
  const hoje = hojeSP();

  const { data } = await supabase
    .from("contas_pagar")
    .select("*, fornecedor:fornecedores(nome, documento, chave_pix), plano:plano_contas(codigo, nome, grupo), empresa:empresas(nome)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const conta = data as ContaPagar & {
    fornecedor: { nome: string; documento: string | null; chave_pix: string | null } | null;
    plano: { codigo: string; nome: string; grupo: string } | null;
    empresa: { nome: string } | null;
    pago_por: string | null;
  };

  const [{ data: contasFin }, { data: empresas }, { data: historico }, { data: grupo }, { data: fornecedores }, { data: categorias }, { data: pessoas }] =
    await Promise.all([
      supabase.from("contas_financeiras").select("*").eq("ativo", true).order("nome"),
      supabase.from("empresas").select("id, nome").eq("ativo", true).order("principal", { ascending: false }),
      supabase
        .from("auditoria")
        .select("acao, motivo, criado_em")
        .eq("tabela", "contas_pagar")
        .eq("registro_id", id)
        .in("acao", ["ESTORNO", "CANCELAMENTO"])
        .order("criado_em", { ascending: false }),
      conta.grupo_id
        ? supabase.from("contas_pagar").select("id, parcela, data_vencimento, valor, status").eq("grupo_id", conta.grupo_id).order("data_vencimento")
        : Promise.resolve({ data: [] }),
      supabase.from("fornecedores").select("id, nome, plano_conta_id, forma_padrao").eq("ativo", true).order("nome"),
      supabase.from("plano_contas").select("id, codigo, nome, grupo, tipo, ativo").neq("tipo", "receita").eq("ativo", true).order("ordem"),
      supabase.from("perfis").select("id, nome"),
    ]);

  const assinar = async (caminho: string | null) => {
    if (!caminho) return null;
    const { data: s } = await supabase.storage.from("contas-pagar").createSignedUrl(caminho, 600);
    return s?.signedUrl ?? null;
  };
  const [urlBoleto, urlComprovante] = await Promise.all([assinar(conta.boleto_path), assinar(conta.comprovante_path)]);

  const sit = situacaoConta(conta, hoje);
  const contaPg = (contasFin as ContaFinanceira[] | null)?.find((c) => c.id === conta.conta_pagamento_id);
  const financeiro = podeConferir(perfil.papel);
  const nome = (uid: string | null) => pessoas?.find((p) => p.id === uid)?.nome ?? "—";

  const Linha = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-grafite/55">{rotulo}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );

  return (
    <>
      <Link href="/pagar" className="mb-4 inline-flex items-center gap-1 text-sm text-cobre-700 hover:underline">
        <ChevronLeft size={16} /> Contas a pagar
      </Link>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-cobre-700">{conta.empresa?.nome}</p>
          <h1 className="mt-1 text-2xl font-light tracking-wide">{conta.fornecedor?.nome}</h1>
          <p className="text-sm text-grafite/60">{conta.descricao}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-2xl font-light">{formatarMoeda(conta.status === "pago" ? conta.valor_pago : conta.valor)}</span>
          <Selo tom={TOM_SITUACAO[sit]}>{ROTULO_SITUACAO[sit]}</Selo>
        </div>
      </div>

      {sp.criada && <div className="mb-4"><Aviso tom="verde">Conta lançada.</Aviso></div>}
      {conta.status === "cancelado" && conta.motivo_cancelamento && (
        <div className="mb-4"><Aviso tom="amarelo">Cancelada: {conta.motivo_cancelamento}</Aviso></div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Cartao>
            <TituloCartao>Detalhes</TituloCartao>
            <dl className="divide-y divide-linha/70 px-4 sm:px-5">
              <Linha rotulo="Vencimento"><span className={cx("num", sit === "vencida" && "text-red-700")}>{formatarData(conta.data_vencimento)}</span></Linha>
              <Linha rotulo="Valor"><span className="num">{formatarMoeda(conta.valor)}</span></Linha>
              <Linha rotulo="Categoria">{conta.plano?.codigo} · {conta.plano?.nome}</Linha>
              <Linha rotulo="Competência">{formatarMes(conta.competencia)}</Linha>
              <Linha rotulo="Forma">{ROTULO_FORMA_DESPESA[conta.forma]}</Linha>
              {conta.parcela && <Linha rotulo="Parcela">{conta.parcela} de {conta.total_parcelas}</Linha>}
              {conta.documento && <Linha rotulo="Documento">{conta.documento}</Linha>}
              {conta.fornecedor?.documento && <Linha rotulo="CNPJ/CPF">{conta.fornecedor.documento}</Linha>}
              {conta.fornecedor?.chave_pix && <Linha rotulo="Chave Pix"><span className="break-all">{conta.fornecedor.chave_pix}</span></Linha>}
              {conta.codigo_barras && <Linha rotulo="Código de barras"><span className="num break-all text-xs">{conta.codigo_barras}</span></Linha>}
              {conta.observacoes && <Linha rotulo="Observações">{conta.observacoes}</Linha>}
              <Linha rotulo="Origem">{conta.origem === "planilha" ? "Importada da planilha" : "Lançada no sistema"}</Linha>
            </dl>
          </Cartao>

          {conta.status === "pago" && (
            <Cartao>
              <TituloCartao>Pagamento</TituloCartao>
              <dl className="divide-y divide-linha/70 px-4 sm:px-5">
                <Linha rotulo="Pago em"><span className="num">{formatarData(conta.data_pagamento)}</span></Linha>
                <Linha rotulo="Conta">
                  {contaPg?.nome}
                  {contaPg && contaPg.empresa_id !== conta.empresa_id && <span className="block text-xs text-amber-700">conta de outra empresa</span>}
                </Linha>
                {Number(conta.juros_multa) > 0 && <Linha rotulo="Juros/multa"><span className="num">{formatarMoeda(conta.juros_multa)}</span></Linha>}
                {Number(conta.desconto) > 0 && <Linha rotulo="Desconto"><span className="num">{formatarMoeda(conta.desconto)}</span></Linha>}
                <Linha rotulo="Valor pago"><strong className="num font-medium">{formatarMoeda(conta.valor_pago)}</strong></Linha>
                <Linha rotulo="Registrado por">{nome(conta.pago_por)} · {formatarDataHora(conta.pago_em)}</Linha>
              </dl>
            </Cartao>
          )}

          {(grupo?.length ?? 0) > 1 && (
            <Cartao>
              <TituloCartao>{conta.parcela ? "Todas as parcelas" : "Recorrência"}</TituloCartao>
              <ul className="divide-y divide-linha/70">
                {grupo!.map((g) => {
                  const s = situacaoConta(g as Pick<ContaPagar, "status" | "data_vencimento">, hoje);
                  return (
                    <li key={g.id}>
                      <Link href={`/pagar/${g.id}`} className={cx("flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-cobre-50/50 sm:px-5", g.id === id && "bg-cobre-50")}>
                        <span className="w-10 text-grafite/50">{g.parcela ? `${g.parcela}ª` : ""}</span>
                        <span className="num">{formatarData(g.data_vencimento)}</span>
                        <span className="num ml-auto">{formatarMoeda(g.valor)}</span>
                        <Selo tom={TOM_SITUACAO[s]}>{ROTULO_SITUACAO[s]}</Selo>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Cartao>
          )}

          {financeiro && conta.status === "aberto" && (
            <details className="group rounded-xl border border-linha bg-white">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-cobre-700 sm:px-5 [&::-webkit-details-marker]:hidden">
                Editar lançamento
              </summary>
              <div className="border-t border-linha bg-creme/50 p-4 sm:p-5">
                <FormularioConta
                  conta={{ ...conta, fornecedor_nome: conta.fornecedor?.nome ?? "" }}
                  empresas={empresas ?? []}
                  fornecedores={(fornecedores ?? []) as Fornecedor[]}
                  categorias={(categorias ?? []) as PlanoConta[]}
                  hoje={hoje}
                />
              </div>
            </details>
          )}

          {(historico?.length ?? 0) > 0 && (
            <Cartao className="p-4 text-sm sm:p-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-cobre-700">Histórico</p>
              <ul className="space-y-2">
                {historico!.map((h, i) => (
                  <li key={i}>
                    <span className="text-grafite/55">{formatarDataHora(h.criado_em)} · {h.acao === "ESTORNO" ? "Estorno" : "Cancelamento"}:</span> {h.motivo}
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>

        <AcoesConta
          id={conta.id}
          status={conta.status}
          valor={Number(conta.valor)}
          empresaId={conta.empresa_id}
          hoje={hoje}
          contas={(contasFin ?? []) as ContaFinanceira[]}
          empresas={empresas ?? []}
          urlBoleto={urlBoleto}
          urlComprovante={urlComprovante}
          podeEditar={financeiro}
        />
      </div>
    </>
  );
}
