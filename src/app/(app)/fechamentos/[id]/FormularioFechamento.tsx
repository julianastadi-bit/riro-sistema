"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Paperclip, Plus, Trash2 } from "lucide-react";
import { Aviso, AreaTexto, Botao, Cartao, Entrada, Selecao, TituloCartao, cx } from "@/components/ui";
import { formatarMoeda, formatarNumero, lerValor, somar } from "@/lib/formatacao";
import type { Fechamento, FechamentoItem, FormaPagamento, GrupoPagamento, MovimentoCaixa, Papel } from "@/lib/tipos";
import { ROTULO_GRUPO } from "@/lib/tipos";
import {
  anexarComprovante, conferirFechamento, enviarFechamento, excluirFechamento,
  reabrirFechamento, salvarFechamento, type DadosFechamento, type Resultado,
} from "../actions";

type Linha = { qtd: string; valor: string };
type Mov = { tipo: "sangria" | "suprimento"; valor: string; descricao: string };

const textoValor = (v: number | null | undefined) => (v ? formatarNumero(v) : "");
const valorOuZero = (t: string) => lerValor(t) ?? 0;

interface Props {
  fechamento: Fechamento;
  formas: FormaPagamento[];
  itens: FechamentoItem[];
  movimentos: MovimentoCaixa[];
  papel: Papel;
  podeConferir: boolean;
  podeExcluir: boolean;
  urlComprovante: string | null;
}

/** Agrupa formas preservando a ordem (ex.: Crédito → Amex, Master, Visa) */
function agrupar(formas: FormaPagamento[]) {
  const grupos: { grupo: GrupoPagamento; formas: FormaPagamento[] }[] = [];
  for (const f of formas) {
    const g = grupos.find((x) => x.grupo === f.grupo);
    if (g) g.formas.push(f);
    else grupos.push({ grupo: f.grupo, formas: [f] });
  }
  return grupos;
}

export function FormularioFechamento({ fechamento, formas, itens, movimentos, podeConferir, podeExcluir, urlComprovante }: Props) {
  const editavel = fechamento.status === "rascunho";
  const [pendente, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<Resultado>({});
  const [sujo, setSujo] = useState(false);

  const [linhas, setLinhas] = useState<Record<string, Linha>>(() => {
    const m: Record<string, Linha> = {};
    for (const f of formas) {
      const it = itens.find((i) => i.forma_pagamento_id === f.id);
      m[f.id] = { qtd: it?.quantidade ? String(it.quantidade) : "", valor: textoValor(it ? Number(it.valor) : 0) };
    }
    return m;
  });
  const [totalAvec, setTotalAvec] = useState(textoValor(fechamento.total_avec));
  const [inicial, setInicial] = useState(textoValor(fechamento.dinheiro_inicial));
  const [contado, setContado] = useState(fechamento.dinheiro_contado === null ? "" : formatarNumero(fechamento.dinheiro_contado));
  const [observacoes, setObservacoes] = useState(fechamento.observacoes ?? "");
  const [movs, setMovs] = useState<Mov[]>(() =>
    movimentos.map((m) => ({ tipo: m.tipo, valor: formatarNumero(m.valor), descricao: m.descricao })),
  );

  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo]);

  const alterar = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setSujo(true);
  };

  const gruposFaturado = useMemo(() => agrupar(formas.filter((f) => f.soma_total_avec)), [formas]);
  const gruposOutros = useMemo(() => agrupar(formas.filter((f) => !f.soma_total_avec)), [formas]);

  const somaGrupo = (fs: FormaPagamento[]) => somar(fs.map((f) => valorOuZero(linhas[f.id]?.valor ?? "")));
  const totalCalculado = somar(gruposFaturado.map((g) => somaGrupo(g.formas)));
  const avec = lerValor(totalAvec);
  const difAvec = avec === null ? null : somar([avec, -totalCalculado]);

  const dinheiroVendas = somaGrupo(formas.filter((f) => f.grupo === "dinheiro"));
  const suprimentos = somar(movs.filter((m) => m.tipo === "suprimento").map((m) => valorOuZero(m.valor)));
  const sangrias = somar(movs.filter((m) => m.tipo === "sangria").map((m) => valorOuZero(m.valor)));
  const esperado = somar([valorOuZero(inicial), dinheiroVendas, suprimentos, -sangrias]);
  const contadoNum = lerValor(contado);
  const difGaveta = contadoNum === null ? null : somar([contadoNum, -esperado]);

  function montar(): DadosFechamento {
    return {
      total_avec: avec,
      dinheiro_inicial: valorOuZero(inicial),
      dinheiro_contado: contadoNum,
      observacoes,
      itens: formas.map((f) => ({
        forma_pagamento_id: f.id,
        quantidade: Math.max(0, parseInt(linhas[f.id]?.qtd || "0", 10) || 0),
        valor: valorOuZero(linhas[f.id]?.valor ?? ""),
      })),
      movimentos: movs.map((m) => ({ tipo: m.tipo, valor: valorOuZero(m.valor), descricao: m.descricao })),
    };
  }

  function executar(acao: () => Promise<Resultado>, limpa = false) {
    setMensagem({});
    iniciar(async () => {
      const r = await acao();
      setMensagem(r);
      if (!r.erro && limpa) setSujo(false);
      if (r.erro || r.ok) window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const salvar = () => executar(() => salvarFechamento(fechamento.id, montar()), true);

  const enviar = () => {
    const linhasConfirmacao = [
      `Total calculado: ${formatarMoeda(totalCalculado)}`,
      `Total Avec: ${avec === null ? "não informado" : formatarMoeda(avec)}`,
      difGaveta !== null && difGaveta !== 0 ? `Diferença na gaveta: ${formatarMoeda(difGaveta)}` : null,
      "",
      "Depois de enviado, o fechamento só pode ser alterado se o financeiro reabrir. Confirmar envio?",
    ].filter((l) => l !== null);
    if (!window.confirm(linhasConfirmacao.join("\n"))) return;
    executar(() => enviarFechamento(fechamento.id, montar()), true);
  };

  const conferir = () => {
    if (!window.confirm("Confirmar que os valores foram conferidos?")) return;
    executar(() => conferirFechamento(fechamento.id));
  };

  const reabrir = () => {
    const motivo = window.prompt("Motivo da reabertura (fica registrado):");
    if (motivo === null) return;
    executar(() => reabrirFechamento(fechamento.id, motivo));
  };

  const excluir = () => {
    if (!window.confirm("Excluir este rascunho? Esta ação não pode ser desfeita.")) return;
    executar(() => excluirFechamento(fechamento.id));
  };

  const anexar = (dados: FormData) => executar(() => anexarComprovante(fechamento.id, dados));

  const linhaForma = (f: FormaPagamento, rotulo: string, filho: boolean) => (
    <div key={f.id} className={cx("grid grid-cols-[1fr_3.75rem_7.5rem] items-center gap-2 px-4 py-1.5 sm:px-5", filho && "pl-7 sm:pl-9")}>
      <label htmlFor={`v-${f.id}`} className={cx("text-sm", filho ? "italic text-grafite/70" : "font-medium")}>
        {filho ? `– ${rotulo}` : rotulo}
      </label>
      <Entrada
        aria-label={`Quantidade ${f.nome}`}
        inputMode="numeric"
        placeholder="qtd"
        className="num px-2 text-center"
        disabled={!editavel}
        value={linhas[f.id]?.qtd ?? ""}
        onChange={(e) =>
          alterar(setLinhas)({ ...linhas, [f.id]: { ...linhas[f.id], qtd: e.target.value.replace(/\D/g, "") } })
        }
      />
      <Entrada
        id={`v-${f.id}`}
        inputMode="decimal"
        placeholder="0,00"
        className="num text-right"
        disabled={!editavel}
        value={linhas[f.id]?.valor ?? ""}
        onChange={(e) => alterar(setLinhas)({ ...linhas, [f.id]: { ...linhas[f.id], valor: e.target.value } })}
        onBlur={(e) => {
          const v = lerValor(e.target.value);
          setLinhas((l) => ({ ...l, [f.id]: { ...l[f.id], valor: v === null ? "" : formatarNumero(v) } }));
        }}
      />
    </div>
  );

  const blocoGrupos = (grupos: ReturnType<typeof agrupar>) =>
    grupos.map((g) =>
      g.formas.length === 1 ? (
        <div key={g.grupo} className="border-b border-linha/70 py-1 last:border-0">
          {linhaForma(g.formas[0], g.formas[0].nome, false)}
        </div>
      ) : (
        <div key={g.grupo} className="border-b border-linha/70 py-1 last:border-0">
          <div className="flex items-center justify-between px-4 pb-1 pt-2 sm:px-5">
            <span className="text-sm font-medium">{ROTULO_GRUPO[g.grupo]}</span>
            <span className="num text-sm text-grafite/70">{formatarNumero(somaGrupo(g.formas))}</span>
          </div>
          {g.formas.map((f) => linhaForma(f, f.bandeira ?? f.nome, true))}
        </div>
      ),
    );

  const campoValor = (valor: string, setter: (v: string) => void, props: { id: string; placeholder?: string }) => (
    <Entrada
      id={props.id}
      inputMode="decimal"
      placeholder={props.placeholder ?? "0,00"}
      className="num text-right"
      disabled={!editavel}
      value={valor}
      onChange={(e) => alterar(setter)(e.target.value)}
      onBlur={(e) => {
        const v = lerValor(e.target.value);
        setter(v === null ? "" : formatarNumero(v));
      }}
    />
  );

  return (
    <div className="space-y-5 pb-28">
      {mensagem.erro && <Aviso tom="vermelho">{mensagem.erro}</Aviso>}
      {mensagem.ok && <Aviso tom="verde">{mensagem.ok}</Aviso>}
      {editavel && (
        <Aviso tom="azul">
          Copie os valores da tela <strong>Fechamento de caixa</strong> do Avec. Em Dinheiro, use a linha
          <em> “– Comandas”</em>.
        </Aviso>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Cartao>
            <TituloCartao>Pagamentos</TituloCartao>
            <div className="grid grid-cols-[1fr_3.75rem_7.5rem] gap-2 px-4 pt-3 text-[11px] uppercase tracking-wider text-grafite/45 sm:px-5">
              <span>Forma</span>
              <span className="text-center">Qtd</span>
              <span className="text-right">Valor (R$)</span>
            </div>
            {blocoGrupos(gruposFaturado)}
            <div className="space-y-2 border-t-2 border-cobre-300 bg-cobre-50/60 px-4 py-4 sm:px-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Total calculado</span>
                <span className="num font-medium">{formatarNumero(totalCalculado)}</span>
              </div>
              <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2">
                <label htmlFor="total-avec" className="text-sm font-medium">
                  TOTAL FATURADO no Avec
                </label>
                {campoValor(totalAvec, setTotalAvec, { id: "total-avec" })}
              </div>
              {difAvec !== null && (
                <div className={cx("flex items-center justify-between text-sm", difAvec === 0 ? "text-emerald-700" : "text-red-700")}>
                  <span>{difAvec === 0 ? "Confere com o Avec" : "Diferença"}</span>
                  <span className="num font-medium">{formatarNumero(difAvec)}</span>
                </div>
              )}
            </div>
          </Cartao>

          <Cartao>
            <TituloCartao>Não somam no faturado</TituloCartao>
            <p className="px-4 pt-3 text-xs text-grafite/55 sm:px-5">
              Permuta entra na DRE como receita. Dívidas viram contas a receber da cliente.
            </p>
            {blocoGrupos(gruposOutros)}
          </Cartao>
        </div>

        <div className="space-y-5">
          <Cartao>
            <TituloCartao>Gaveta · dinheiro físico</TituloCartao>
            <div className="space-y-3 p-4 sm:p-5">
              <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2">
                <label htmlFor="inicial" className="text-sm">Valor inicial</label>
                {campoValor(inicial, setInicial, { id: "inicial" })}
              </div>
              <Resumo rotulo="+ Dinheiro das comandas" valor={dinheiroVendas} />
              <Resumo rotulo="+ Suprimentos" valor={suprimentos} />
              <Resumo rotulo="− Sangrias" valor={sangrias} />
              <Resumo rotulo="= Esperado na gaveta" valor={esperado} forte />
              <div className="grid grid-cols-[1fr_7.5rem] items-center gap-2 pt-1">
                <label htmlFor="contado" className="text-sm font-medium">Contado na gaveta</label>
                {campoValor(contado, setContado, { id: "contado" })}
              </div>
              {difGaveta !== null && (
                <div className={cx("flex justify-between text-sm", difGaveta === 0 ? "text-emerald-700" : "text-red-700")}>
                  <span>{difGaveta === 0 ? "Gaveta confere" : difGaveta > 0 ? "Sobra" : "Falta"}</span>
                  <span className="num font-medium">{formatarNumero(difGaveta)}</span>
                </div>
              )}
            </div>
          </Cartao>

          <Cartao>
            <TituloCartao
              acao={
                editavel && (
                  <button
                    type="button"
                    onClick={() => alterar(setMovs)([...movs, { tipo: "sangria", valor: "", descricao: "" }])}
                    className="flex items-center gap-1 text-xs font-medium text-cobre-700 hover:underline"
                  >
                    <Plus size={14} /> Adicionar
                  </button>
                )
              }
            >
              Sangrias e suprimentos
            </TituloCartao>
            <div className="space-y-3 p-4 sm:p-5">
              {movs.length === 0 && <p className="text-sm text-grafite/50">Nenhuma movimentação</p>}
              {movs.map((m, i) => {
                const mudar = (parcial: Partial<Mov>) => alterar(setMovs)(movs.map((x, j) => (j === i ? { ...x, ...parcial } : x)));
                return (
                  <div key={i} className="space-y-2 rounded-lg border border-linha p-3">
                    <div className="grid grid-cols-[1fr_7rem_auto] gap-2">
                      <Selecao disabled={!editavel} value={m.tipo} onChange={(e) => mudar({ tipo: e.target.value as Mov["tipo"] })}>
                        <option value="sangria">Sangria</option>
                        <option value="suprimento">Suprimento</option>
                      </Selecao>
                      <Entrada
                        inputMode="decimal"
                        placeholder="0,00"
                        className="num text-right"
                        disabled={!editavel}
                        value={m.valor}
                        onChange={(e) => mudar({ valor: e.target.value })}
                        onBlur={(e) => {
                          const v = lerValor(e.target.value);
                          mudar({ valor: v === null ? "" : formatarNumero(v) });
                        }}
                      />
                      {editavel && (
                        <button
                          type="button"
                          aria-label="Remover"
                          onClick={() => alterar(setMovs)(movs.filter((_, j) => j !== i))}
                          className="rounded-lg px-2 text-grafite/45 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <Entrada
                      placeholder="Descrição (ex.: pagamento motoboy)"
                      disabled={!editavel}
                      value={m.descricao}
                      onChange={(e) => mudar({ descricao: e.target.value })}
                    />
                  </div>
                );
              })}
            </div>
          </Cartao>

          <Cartao>
            <TituloCartao>Observações e comprovante</TituloCartao>
            <div className="space-y-3 p-4 sm:p-5">
              <AreaTexto
                rows={3}
                placeholder="Justifique diferenças, ocorrências do dia…"
                disabled={!editavel}
                value={observacoes}
                onChange={(e) => alterar(setObservacoes)(e.target.value)}
              />
              {urlComprovante && (
                <a href={urlComprovante} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-cobre-700 hover:underline">
                  <Paperclip size={15} /> Ver print do Avec
                </a>
              )}
              {editavel && (
                <form action={anexar} className="flex flex-col gap-2">
                  <input
                    name="arquivo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
                    className="text-xs file:mr-3 file:rounded-md file:border file:border-linha file:bg-white file:px-3 file:py-1.5 file:text-xs file:text-grafite"
                  />
                  <Botao type="submit" variante="secundario" disabled={pendente} className="self-start">
                    <Paperclip size={15} /> {urlComprovante ? "Substituir print" : "Anexar print"}
                  </Botao>
                </form>
              )}
            </div>
          </Cartao>
        </div>
      </div>

      {editavel && podeExcluir && (
        <button type="button" onClick={excluir} disabled={pendente} className="text-xs text-red-700 hover:underline">
          Excluir rascunho
        </button>
      )}

      {/* Barra de ações fixa */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-linha bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <div className="text-xs leading-tight text-grafite/60">
            <span className="block">Total calculado</span>
            <span className="num text-base text-grafite">{formatarMoeda(totalCalculado)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {editavel && (
              <>
                <Botao variante="secundario" onClick={salvar} disabled={pendente}>
                  Salvar
                </Botao>
                <Botao onClick={enviar} disabled={pendente}>
                  {pendente ? "Processando…" : "Enviar fechamento"}
                </Botao>
              </>
            )}
            {!editavel && podeConferir && (
              <Botao variante="perigo" onClick={reabrir} disabled={pendente}>
                Reabrir
              </Botao>
            )}
            {fechamento.status === "enviado" && podeConferir && (
              <Botao onClick={conferir} disabled={pendente}>
                Marcar como conferido
              </Botao>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Resumo({ rotulo, valor, forte }: { rotulo: string; valor: number; forte?: boolean }) {
  return (
    <div className={cx("flex justify-between text-sm", forte ? "border-t border-linha pt-2 font-medium" : "text-grafite/70")}>
      <span>{rotulo}</span>
      <span className="num">{formatarNumero(valor)}</span>
    </div>
  );
}
