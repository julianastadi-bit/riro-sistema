"use client";

import { useState, useTransition } from "react";
import { Paperclip } from "lucide-react";
import { Aviso, Botao, Cartao, Entrada, Selecao, TituloCartao } from "@/components/ui";
import { formatarMoeda, lerValor, somar } from "@/lib/formatacao";
import type { ContaFinanceira, StatusContaPagar } from "@/lib/tipos";
import {
  anexarArquivo, cancelarContaPagar, estornarPagamento, excluirContaPagar, pagarContas, type Resultado,
} from "../actions";

interface Props {
  id: string;
  status: StatusContaPagar;
  valor: number;
  empresaId: string;
  hoje: string;
  contas: ContaFinanceira[];
  empresas: { id: string; nome: string }[];
  urlBoleto: string | null;
  urlComprovante: string | null;
  podeEditar: boolean;
}

export function AcoesConta({ id, status, valor, empresaId, hoje, contas, empresas, urlBoleto, urlComprovante, podeEditar }: Props) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resultado>({});
  const [confirmar, setConfirmar] = useState<null | "cancelar" | "estornar" | "excluir">(null);
  const [motivo, setMotivo] = useState("");
  const [dataPg, setDataPg] = useState(hoje);
  const padrao = contas.find((c) => c.empresa_id === empresaId && c.tipo === "banco")?.id ?? "";
  const [contaPg, setContaPg] = useState(padrao);
  const [juros, setJuros] = useState("");
  const [desconto, setDesconto] = useState("");
  const totalPg = somar([valor, lerValor(juros) ?? 0, -(lerValor(desconto) ?? 0)]);
  const contaOutraEmpresa = contas.find((c) => c.id === contaPg)?.empresa_id !== empresaId && !!contaPg;

  const executar = (fn: () => Promise<Resultado>) => {
    setMsg({});
    iniciar(async () => {
      const r = await fn();
      setMsg(r);
      if (!r.erro) {
        setConfirmar(null);
        setMotivo("");
      }
    });
  };

  const formAnexo = (tipo: "boleto" | "comprovante") => (
    <form action={(d) => executar(() => anexarArquivo(id, tipo, d))} className="flex flex-col gap-2">
      <input
        name="arquivo"
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
        className="text-xs file:mr-3 file:rounded-md file:border file:border-linha file:bg-white file:px-3 file:py-1.5 file:text-xs"
      />
      <Botao type="submit" variante="secundario" disabled={pendente} className="self-start">
        <Paperclip size={15} /> Anexar {tipo}
      </Botao>
    </form>
  );

  return (
    <div className="space-y-5">
      {msg.erro && <Aviso tom="vermelho">{msg.erro}</Aviso>}
      {msg.ok && <Aviso tom="verde">{msg.ok}</Aviso>}

      {podeEditar && status === "aberto" && (
        <Cartao>
          <TituloCartao>Registrar pagamento</TituloCartao>
          <div className="space-y-3 p-4 sm:p-5">
            <label className="block space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-grafite/55">Pago em</span>
              <Entrada type="date" value={dataPg} max={hoje} onChange={(e) => setDataPg(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-grafite/55">Saiu da conta</span>
              <Selecao value={contaPg} onChange={(e) => setContaPg(e.target.value)}>
                <option value="">Selecione…</option>
                {empresas.map((e) => (
                  <optgroup key={e.id} label={e.nome}>
                    {contas.filter((c) => c.empresa_id === e.id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </optgroup>
                ))}
              </Selecao>
              {contaOutraEmpresa && <span className="block text-xs text-amber-700">Conta de outra empresa: ficará sinalizado para acerto entre empresas.</span>}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-grafite/55">Juros/multa</span>
                <Entrada inputMode="decimal" placeholder="0,00" className="num text-right" value={juros} onChange={(e) => setJuros(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-grafite/55">Desconto</span>
                <Entrada inputMode="decimal" placeholder="0,00" className="num text-right" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
              </label>
            </div>
            <div className="flex justify-between border-t border-linha pt-3 text-sm">
              <span>Valor pago</span>
              <strong className="num font-medium">{formatarMoeda(totalPg)}</strong>
            </div>
            <Botao
              className="w-full"
              disabled={pendente || !contaPg}
              onClick={() => executar(() => pagarContas([id], dataPg, contaPg, lerValor(juros) ?? 0, lerValor(desconto) ?? 0))}
            >
              {pendente ? "Registrando…" : "Confirmar pagamento"}
            </Botao>
          </div>
        </Cartao>
      )}

      <Cartao>
        <TituloCartao>Anexos</TituloCartao>
        <div className="space-y-4 p-4 sm:p-5 text-sm">
          <div className="space-y-2">
            <p className="font-medium">Boleto / nota</p>
            {urlBoleto ? (
              <a href={urlBoleto} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-cobre-700 hover:underline"><Paperclip size={14} /> Abrir boleto</a>
            ) : (
              <p className="text-grafite/50">Nenhum arquivo</p>
            )}
            {podeEditar && status === "aberto" && formAnexo("boleto")}
          </div>
          <div className="space-y-2 border-t border-linha pt-4">
            <p className="font-medium">Comprovante de pagamento</p>
            {urlComprovante ? (
              <a href={urlComprovante} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-cobre-700 hover:underline"><Paperclip size={14} /> Abrir comprovante</a>
            ) : (
              <p className="text-grafite/50">Nenhum arquivo</p>
            )}
            {podeEditar && status === "pago" && formAnexo("comprovante")}
          </div>
        </div>
      </Cartao>

      {podeEditar && status !== "cancelado" && (
        <Cartao className="space-y-3 p-4 sm:p-5">
          {!confirmar && (
            <div className="flex flex-wrap gap-2">
              {status === "pago" && <Botao variante="perigo" onClick={() => setConfirmar("estornar")}>Estornar pagamento</Botao>}
              {status === "aberto" && (
                <>
                  <Botao variante="perigo" onClick={() => setConfirmar("cancelar")}>Cancelar conta</Botao>
                  <Botao variante="fantasma" onClick={() => setConfirmar("excluir")}>Excluir</Botao>
                </>
              )}
            </div>
          )}
          {(confirmar === "estornar" || confirmar === "cancelar") && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{confirmar === "estornar" ? "Motivo do estorno" : "Motivo do cancelamento"}</p>
              <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Fica registrado no histórico" autoFocus />
              <div className="flex gap-2">
                <Botao
                  variante="perigo"
                  disabled={pendente || !motivo.trim()}
                  onClick={() => executar(() => (confirmar === "estornar" ? estornarPagamento(id, motivo) : cancelarContaPagar(id, motivo)))}
                >
                  Confirmar
                </Botao>
                <Botao variante="secundario" onClick={() => setConfirmar(null)}>Voltar</Botao>
              </div>
            </div>
          )}
          {confirmar === "excluir" && (
            <div className="space-y-2 text-sm">
              <p>Excluir apaga a conta de vez. Use para lançamentos feitos por engano; para contas que deixaram de existir, prefira cancelar.</p>
              <div className="flex gap-2">
                <Botao variante="perigo" disabled={pendente} onClick={() => executar(() => excluirContaPagar(id))}>Excluir definitivamente</Botao>
                <Botao variante="secundario" onClick={() => setConfirmar(null)}>Voltar</Botao>
              </div>
            </div>
          )}
        </Cartao>
      )}
    </div>
  );
}
