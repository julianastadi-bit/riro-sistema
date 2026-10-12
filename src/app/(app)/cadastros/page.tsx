import Link from "next/link";
import type { ReactNode } from "react";
import { Aviso, Botao, Cabecalho, Cartao, Entrada, Selecao, Selo, cx } from "@/components/ui";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarNumero } from "@/lib/formatacao";
import type { ContaFinanceira, Empresa, FormaPagamento } from "@/lib/tipos";
import { ROTULO_DESTINO, ROTULO_GRUPO } from "@/lib/tipos";
import { salvarConta, salvarEmpresa, salvarForma, salvarPlanoConta } from "./actions";

export const metadata = { title: "Cadastros" };

const ABAS = [
  { id: "formas", rotulo: "Formas de pagamento" },
  { id: "empresas", rotulo: "Empresas" },
  { id: "contas", rotulo: "Contas" },
  { id: "plano", rotulo: "Plano de contas" },
] as const;

const TIPOS_PLANO = ["receita", "deducao", "custo", "despesa", "investimento", "participacao", "financeiro"];

export default async function PaginaCadastros({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; erro?: string; ok?: string }>;
}) {
  await exigirPerfil("financeiro", "admin");
  const sp = await searchParams;
  const aba = ABAS.find((a) => a.id === sp.aba)?.id ?? "formas";

  return (
    <>
      <Cabecalho titulo="Cadastros" subtitulo="Parâmetros que definem como cada lançamento vira caixa, recebível e DRE." />
      <div className="-mx-4 mb-5 overflow-x-auto px-4">
        <div className="flex w-max gap-1 rounded-lg border border-linha bg-white p-0.5">
          {ABAS.map((a) => (
            <Link
              key={a.id}
              href={`/cadastros?aba=${a.id}`}
              className={cx(
                "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap",
                a.id === aba ? "bg-cobre-600 text-white" : "text-grafite/70 hover:text-grafite",
              )}
            >
              {a.rotulo}
            </Link>
          ))}
        </div>
      </div>
      {sp.erro && <div className="mb-4"><Aviso tom="vermelho">{sp.erro}</Aviso></div>}
      {sp.ok && <div className="mb-4"><Aviso tom="verde">Alterações salvas.</Aviso></div>}

      {aba === "formas" && <AbaFormas />}
      {aba === "empresas" && <AbaEmpresas />}
      {aba === "contas" && <AbaContas />}
      {aba === "plano" && <AbaPlano />}
    </>
  );
}

function Check({ nome, rotulo, marcado }: { nome: string; rotulo: string; marcado: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={nome} defaultChecked={marcado} className="size-4 accent-cobre-600" />
      {rotulo}
    </label>
  );
}

function CampoRotulado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-grafite/55">{rotulo}</span>
      {children}
    </label>
  );
}

function Editar({ resumo, children }: { resumo: ReactNode; children: ReactNode }) {
  return (
    <details className="group border-b border-linha last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-cobre-50/50 sm:px-5 [&::-webkit-details-marker]:hidden">
        {resumo}
        <span className="ml-auto text-xs text-cobre-700 group-open:hidden">editar</span>
        <span className="ml-auto hidden text-xs text-grafite/50 group-open:inline">fechar</span>
      </summary>
      <div className="border-t border-linha/60 bg-creme/60 px-4 py-4 sm:px-5">{children}</div>
    </details>
  );
}

function CamposForma({ f }: { f?: FormaPagamento }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <CampoRotulado rotulo="Nome"><Entrada name="nome" defaultValue={f?.nome} required /></CampoRotulado>
        <CampoRotulado rotulo="Bandeira"><Entrada name="bandeira" defaultValue={f?.bandeira ?? ""} /></CampoRotulado>
        <CampoRotulado rotulo="Taxa (%)">
          <Entrada name="taxa_percentual" inputMode="decimal" defaultValue={f ? formatarNumero(f.taxa_percentual) : "0,00"} />
        </CampoRotulado>
        <CampoRotulado rotulo="Prazo (dias)">
          <Entrada name="prazo_dias" inputMode="numeric" defaultValue={f?.prazo_dias ?? 0} />
        </CampoRotulado>
        <CampoRotulado rotulo="Destino do recebível">
          <Selecao name="destino" defaultValue={f?.destino ?? ""}>
            <option value="">—</option>
            {Object.entries(ROTULO_DESTINO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </Selecao>
        </CampoRotulado>
        <CampoRotulado rotulo="Ordem"><Entrada name="ordem" inputMode="numeric" defaultValue={f?.ordem ?? 0} /></CampoRotulado>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Check nome="dias_uteis" rotulo="Prazo em dias úteis" marcado={f?.dias_uteis ?? false} />
        <Check nome="taxa_confirmada" rotulo="Taxa confirmada com a adquirente" marcado={f?.taxa_confirmada ?? false} />
        <Check nome="soma_total_avec" rotulo="Soma no TOTAL FATURADO" marcado={f?.soma_total_avec ?? true} />
        <Check nome="gera_recebivel" rotulo="Gera contas a receber" marcado={f?.gera_recebivel ?? true} />
        <Check nome="receita_dre" rotulo="Receita na DRE" marcado={f?.receita_dre ?? true} />
        <Check nome="ativo" rotulo="Ativa" marcado={f?.ativo ?? true} />
      </div>
    </div>
  );
}

async function AbaFormas() {
  const supabase = await criarClienteServidor();
  const [{ data }, { data: adquirentes }] = await Promise.all([
    supabase.from("formas_pagamento").select("*").order("ordem"),
    supabase.from("adquirentes").select("id, nome").order("nome"),
  ]);
  const formas = (data ?? []) as FormaPagamento[];
  const pendentes = formas.filter((f) => f.ativo && !f.taxa_confirmada).length;

  return (
    <div className="space-y-4">
      {pendentes > 0 && (
        <Aviso>
          {pendentes} forma(s) com taxa <strong>a confirmar</strong>. Os valores atuais (2% crédito, 0,91% débito, D+1 útil) vieram da
          planilha. Ajuste conforme o contrato Safrapay.
        </Aviso>
      )}
      <Cartao>
        {formas.map((f) => (
          <Editar
            key={f.id}
            resumo={
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <span className={cx("text-sm font-medium", !f.ativo && "text-grafite/40 line-through")}>{f.nome}</span>
                <span className="text-xs text-grafite/50">{ROTULO_GRUPO[f.grupo]}</span>
                {f.gera_recebivel && (
                  <span className="num text-xs text-grafite/70">
                    {formatarNumero(f.taxa_percentual)}% · D+{f.prazo_dias}
                    {f.dias_uteis ? " útil" : ""}
                  </span>
                )}
                {!f.soma_total_avec && <Selo>fora do faturado</Selo>}
                {f.gera_recebivel && !f.taxa_confirmada && <Selo tom="amarelo">taxa a confirmar</Selo>}
              </div>
            }
          >
            <form action={salvarForma} className="space-y-4">
              <input type="hidden" name="id" value={f.id} />
              <CamposForma f={f} />
              <Botao type="submit">Salvar</Botao>
            </form>
          </Editar>
        ))}
      </Cartao>

      <Cartao className="p-4 sm:p-5">
        <h3 className="mb-4 text-sm font-medium">Nova forma de pagamento</h3>
        <form action={salvarForma} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <CampoRotulado rotulo="Código"><Entrada name="codigo" placeholder="CREDITO_ELO" required /></CampoRotulado>
            <CampoRotulado rotulo="Grupo">
              <Selecao name="grupo" required>
                {Object.entries(ROTULO_GRUPO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </Selecao>
            </CampoRotulado>
            <CampoRotulado rotulo="Adquirente">
              <Selecao name="adquirente_id" defaultValue="">
                <option value="">Nenhuma</option>
                {adquirentes?.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </Selecao>
            </CampoRotulado>
          </div>
          <CamposForma />
          <Botao type="submit">Adicionar</Botao>
        </form>
      </Cartao>
    </div>
  );
}

async function AbaEmpresas() {
  const supabase = await criarClienteServidor();
  const [{ data: empresas }, { data: contas }] = await Promise.all([
    supabase.from("empresas").select("*").order("principal", { ascending: false }),
    supabase.from("contas_financeiras").select("*").eq("ativo", true).order("nome"),
  ]);
  return (
    <div className="space-y-4">
      <Cartao>
        {((empresas ?? []) as Empresa[]).map((e) => {
          const daEmpresa = ((contas ?? []) as ContaFinanceira[]).filter((c) => c.empresa_id === e.id);
          const nomeConta = (id: string | null) => daEmpresa.find((c) => c.id === id)?.nome ?? "não definida";
          const seletor = (nome: string, valor: string | null) => (
            <Selecao name={nome} defaultValue={valor ?? ""}>
              <option value="">—</option>
              {daEmpresa.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          );
          return (
            <Editar
              key={e.id}
              resumo={
                <div className="min-w-0 flex-1">
                  <p className={cx("text-sm font-medium", !e.ativo && "text-grafite/40 line-through")}>
                    {e.nome} {e.principal && <Selo tom="cobre">principal</Selo>}
                  </p>
                  <p className="mt-0.5 text-xs text-grafite/55">
                    Caixa: {nomeConta(e.conta_caixa_id)} · Banco: {nomeConta(e.conta_banco_id)} · Adquirente: {nomeConta(e.conta_adquirente_id)}
                  </p>
                </div>
              }
            >
              <form action={salvarEmpresa} className="space-y-4">
                <input type="hidden" name="id" value={e.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <CampoRotulado rotulo="Nome"><Entrada name="nome" defaultValue={e.nome} required /></CampoRotulado>
                  <CampoRotulado rotulo="Razão social"><Entrada name="razao_social" defaultValue={e.razao_social ?? ""} /></CampoRotulado>
                  <CampoRotulado rotulo="CNPJ"><Entrada name="cnpj" defaultValue={e.cnpj ?? ""} /></CampoRotulado>
                  <CampoRotulado rotulo="Dinheiro cai em">{seletor("conta_caixa_id", e.conta_caixa_id)}</CampoRotulado>
                  <CampoRotulado rotulo="Pix / transferência caem em">{seletor("conta_banco_id", e.conta_banco_id)}</CampoRotulado>
                  <CampoRotulado rotulo="Cartões (Safrapay) caem em">{seletor("conta_adquirente_id", e.conta_adquirente_id)}</CampoRotulado>
                </div>
                <Check nome="ativo" rotulo="Ativa" marcado={e.ativo} />
                <Botao type="submit">Salvar</Botao>
              </form>
            </Editar>
          );
        })}
      </Cartao>
      <Cartao className="p-4 sm:p-5">
        <h3 className="mb-4 text-sm font-medium">Nova empresa</h3>
        <form action={salvarEmpresa} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <CampoRotulado rotulo="Nome"><Entrada name="nome" required /></CampoRotulado>
          <CampoRotulado rotulo="Razão social"><Entrada name="razao_social" /></CampoRotulado>
          <CampoRotulado rotulo="CNPJ"><Entrada name="cnpj" /></CampoRotulado>
          <Botao type="submit">Adicionar</Botao>
        </form>
      </Cartao>
    </div>
  );
}

async function AbaContas() {
  const supabase = await criarClienteServidor();
  const [{ data: empresas }, { data: contas }] = await Promise.all([
    supabase.from("empresas").select("id, nome").order("principal", { ascending: false }),
    supabase.from("contas_financeiras").select("*").order("nome"),
  ]);
  return (
    <div className="space-y-4">
      {empresas?.map((e) => (
        <Cartao key={e.id}>
          <div className="border-b border-linha px-4 py-3 text-xs font-medium uppercase tracking-[0.14em] text-cobre-700 sm:px-5">{e.nome}</div>
          {((contas ?? []) as ContaFinanceira[])
            .filter((c) => c.empresa_id === e.id)
            .map((c) => (
              <Editar
                key={c.id}
                resumo={
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={cx("text-sm font-medium", !c.ativo && "text-grafite/40 line-through")}>{c.nome}</span>
                    <Selo tom={c.tipo === "banco" ? "azul" : "cobre"}>{c.tipo === "banco" ? "Banco" : "Caixa físico"}</Selo>
                  </div>
                }
              >
                <form action={salvarConta} className="space-y-4">
                  <input type="hidden" name="id" value={c.id} />
                  <div className="grid gap-3 sm:grid-cols-4">
                    <CampoRotulado rotulo="Nome"><Entrada name="nome" defaultValue={c.nome} required /></CampoRotulado>
                    <CampoRotulado rotulo="Banco"><Entrada name="banco" defaultValue={c.banco ?? ""} /></CampoRotulado>
                    <CampoRotulado rotulo="Agência"><Entrada name="agencia" defaultValue={c.agencia ?? ""} /></CampoRotulado>
                    <CampoRotulado rotulo="Conta"><Entrada name="numero" defaultValue={c.numero ?? ""} /></CampoRotulado>
                  </div>
                  <Check nome="ativo" rotulo="Ativa" marcado={c.ativo} />
                  <Botao type="submit">Salvar</Botao>
                </form>
              </Editar>
            ))}
        </Cartao>
      ))}
      <Cartao className="p-4 sm:p-5">
        <h3 className="mb-4 text-sm font-medium">Nova conta</h3>
        <form action={salvarConta} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(6,1fr)_auto] lg:items-end">
          <CampoRotulado rotulo="Empresa">
            <Selecao name="empresa_id" required>
              {empresas?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Selecao>
          </CampoRotulado>
          <CampoRotulado rotulo="Tipo">
            <Selecao name="tipo"><option value="banco">Banco</option><option value="caixa">Caixa físico</option></Selecao>
          </CampoRotulado>
          <CampoRotulado rotulo="Nome"><Entrada name="nome" required /></CampoRotulado>
          <CampoRotulado rotulo="Banco"><Entrada name="banco" /></CampoRotulado>
          <CampoRotulado rotulo="Agência"><Entrada name="agencia" /></CampoRotulado>
          <CampoRotulado rotulo="Conta"><Entrada name="numero" /></CampoRotulado>
          <Botao type="submit">Adicionar</Botao>
        </form>
      </Cartao>
    </div>
  );
}

async function AbaPlano() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("plano_contas").select("*").order("ordem");
  const grupos = [...new Set((data ?? []).map((c) => c.grupo as string))];
  return (
    <div className="space-y-4">
      <Cartao>
        {grupos.map((g) => (
          <div key={g}>
            <div className="border-b border-linha bg-creme/60 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-cobre-700 sm:px-5">{g}</div>
            {(data ?? [])
              .filter((c) => c.grupo === g)
              .map((c) => (
                <Editar
                  key={c.id}
                  resumo={
                    <div className="min-w-0 flex-1">
                      <p className={cx("text-sm", !c.ativo && "text-grafite/40 line-through")}>
                        <span className="num mr-2 text-grafite/50">{c.codigo}</span>
                        {c.nome}
                      </p>
                      {c.descricao && <p className="mt-0.5 text-xs text-grafite/50">{c.descricao}</p>}
                    </div>
                  }
                >
                  <form action={salvarPlanoConta} className="space-y-4">
                    <input type="hidden" name="id" value={c.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <CampoRotulado rotulo="Nome"><Entrada name="nome" defaultValue={c.nome} required /></CampoRotulado>
                      <CampoRotulado rotulo="Descrição"><Entrada name="descricao" defaultValue={c.descricao ?? ""} /></CampoRotulado>
                    </div>
                    <Check nome="ativo" rotulo="Ativa" marcado={c.ativo} />
                    <Botao type="submit">Salvar</Botao>
                  </form>
                </Editar>
              ))}
          </div>
        ))}
      </Cartao>
      <Cartao className="p-4 sm:p-5">
        <h3 className="mb-4 text-sm font-medium">Nova conta contábil</h3>
        <form action={salvarPlanoConta} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[6rem_1fr_1fr_10rem_1fr_auto] lg:items-end">
          <CampoRotulado rotulo="Código"><Entrada name="codigo" placeholder="4.08" required /></CampoRotulado>
          <CampoRotulado rotulo="Nome"><Entrada name="nome" required /></CampoRotulado>
          <CampoRotulado rotulo="Grupo (DRE)">
            <Entrada name="grupo" list="grupos-dre" required />
            <datalist id="grupos-dre">{grupos.map((g) => <option key={g} value={g} />)}</datalist>
          </CampoRotulado>
          <CampoRotulado rotulo="Tipo">
            <Selecao name="tipo">{TIPOS_PLANO.map((t) => <option key={t} value={t}>{t}</option>)}</Selecao>
          </CampoRotulado>
          <CampoRotulado rotulo="Descrição"><Entrada name="descricao" /></CampoRotulado>
          <Botao type="submit">Adicionar</Botao>
        </form>
      </Cartao>
    </div>
  );
}
