import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BotaoLink, Cabecalho, Cartao, Indicador, Selo, TituloCartao, cx } from "@/components/ui";
import { exigirPerfil, podeVerFinanceiro } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { diaSemana, formatarData, formatarMoeda, hojeSP, somar, somarDias } from "@/lib/formatacao";
import type { StatusFechamento } from "@/lib/tipos";
import { ROTULO_STATUS_FECHAMENTO, TOM_STATUS_FECHAMENTO } from "@/lib/tipos";

export default async function Painel() {
  const perfil = await exigirPerfil();
  const supabase = await criarClienteServidor();
  const hoje = hojeSP();
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const seteDias = somarDias(hoje, -6);

  const { data: empresas } = await supabase.from("empresas").select("id, nome").eq("ativo", true).order("principal", { ascending: false });
  const desde = inicioMes < seteDias ? inicioMes : seteDias;
  const { data: fechamentos } = await supabase
    .from("fechamentos_caixa")
    .select("id, empresa_id, data, status, total_avec")
    .gte("data", desde)
    .lte("data", hoje);

  const ultimos7: string[] = [];
  for (let d = hoje; d >= seteDias; d = somarDias(d, -1)) ultimos7.push(d);
  const achar = (empresa: string, data: string) => fechamentos?.find((f) => f.empresa_id === empresa && f.data === data);

  const financeiro = podeVerFinanceiro(perfil.papel);
  let indicadores = null;
  if (financeiro) {
    const doMes = (fechamentos ?? []).filter((f) => f.data >= inicioMes && f.status !== "rascunho");
    const aguardando = (fechamentos ?? []).filter((f) => f.status === "enviado").length;
    const { count: totalAguardando } = await supabase
      .from("fechamentos_caixa")
      .select("id", { count: "exact", head: true })
      .eq("status", "enviado");
    const { data: proximos } = await supabase
      .from("recebiveis")
      .select("valor_liquido, data_prevista")
      .eq("status", "previsto")
      .lte("data_prevista", somarDias(hoje, 7));
    const atrasados = (proximos ?? []).filter((r) => r.data_prevista < hoje);
    const { data: aPagar } = await supabase
      .from("contas_pagar")
      .select("valor, data_vencimento")
      .eq("status", "aberto")
      .lte("data_vencimento", somarDias(hoje, 7));
    const pagarVencido = (aPagar ?? []).filter((c) => c.data_vencimento < hoje);
    const pagar7 = somar((aPagar ?? []).filter((c) => c.data_vencimento >= hoje).map((c) => Number(c.valor)));
    const receber7 = somar((proximos ?? []).filter((r) => r.data_prevista >= hoje).map((r) => Number(r.valor_liquido)));
    indicadores = (
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Indicador
          rotulo="Faturado no mês"
          valor={formatarMoeda(somar(doMes.map((f) => Number(f.total_avec ?? 0))))}
          detalhe={`${doMes.length} fechamento(s) enviados`}
        />
        <Indicador
          rotulo="Aguardando conferência"
          valor={totalAguardando ?? aguardando}
          detalhe="Fechamentos enviados pela operação"
        />
        <Indicador
          rotulo="A receber em 7 dias"
          valor={formatarMoeda(somar((proximos ?? []).filter((r) => r.data_prevista >= hoje).map((r) => Number(r.valor_liquido))))}
          detalhe="Líquido de taxas"
        />
        <Indicador
          rotulo="Recebíveis atrasados"
          valor={formatarMoeda(somar(atrasados.map((r) => Number(r.valor_liquido))))}
          detalhe={`${atrasados.length} sem conciliação`}
          tom={atrasados.length ? "alerta" : undefined}
        />
        <Indicador
          rotulo="A pagar em 7 dias"
          valor={formatarMoeda(pagar7)}
          detalhe={
            pagarVencido.length
              ? `+ ${formatarMoeda(somar(pagarVencido.map((c) => Number(c.valor))))} vencidos (${pagarVencido.length})`
              : "Nenhuma conta vencida"
          }
          tom={pagarVencido.length ? "alerta" : undefined}
        />
        <Indicador
          rotulo="Saldo previsto 7 dias"
          valor={formatarMoeda(somar([receber7, -pagar7]))}
          detalhe="A receber − a pagar (sem saldo bancário)"
          tom={receber7 - pagar7 < 0 ? "alerta" : undefined}
        />
      </div>
    );
  }

  const primeiroNome = (perfil.nome || "").split(" ")[0];

  return (
    <>
      <Cabecalho
        titulo={primeiroNome ? `Olá, ${primeiroNome}` : "Painel"}
        subtitulo={`Hoje é ${diaSemana(hoje)}, ${formatarData(hoje)}`}
        acoes={
          <BotaoLink href="/fechamentos/novo">
            Lançar fechamento <ArrowRight size={16} />
          </BotaoLink>
        }
      />

      {indicadores}

      <div className="grid gap-5 lg:grid-cols-2">
        {empresas?.map((e) => (
          <Cartao key={e.id}>
            <TituloCartao acao={<Link href={`/fechamentos?empresa=${e.id}`} className="text-xs text-cobre-700 hover:underline">ver mês</Link>}>
              {e.nome} · últimos 7 dias
            </TituloCartao>
            <ul className="divide-y divide-linha/70">
              {ultimos7.map((d) => {
                const f = achar(e.id, d);
                return (
                  <li key={d} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <span className="num w-12">{formatarData(d).slice(0, 5)}</span>
                    <span className="w-10 text-xs uppercase text-grafite/45">{diaSemana(d)}</span>
                    {f ? (
                      <Link href={`/fechamentos/${f.id}`} className="ml-auto flex items-center gap-3">
                        {financeiro && f.total_avec !== null && (
                          <span className="num text-grafite/70">{formatarMoeda(Number(f.total_avec))}</span>
                        )}
                        <Selo tom={TOM_STATUS_FECHAMENTO[f.status as StatusFechamento]}>
                          {ROTULO_STATUS_FECHAMENTO[f.status as StatusFechamento]}
                        </Selo>
                      </Link>
                    ) : (
                      <Link
                        href={`/fechamentos/novo?empresa=${e.id}&data=${d}`}
                        className={cx("ml-auto text-xs font-medium hover:underline", diaSemana(d) === "dom" ? "text-grafite/40" : "text-amber-700")}
                      >
                        Sem lançamento · lançar
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </Cartao>
        ))}
      </div>
    </>
  );
}
