"use client";

import { useActionState } from "react";
import { Botao, Entrada, Aviso } from "@/components/ui";
import { entrar } from "./actions";

export function FormularioLogin({ erroInicial }: { erroInicial?: string }) {
  const [erro, acao, pendente] = useActionState(entrar, erroInicial);
  return (
    <form action={acao} className="space-y-4">
      {erro && <Aviso tom="vermelho">{erro}</Aviso>}
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-grafite/60">E-mail</span>
        <Entrada name="email" type="email" autoComplete="email" required autoFocus />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-grafite/60">Senha</span>
        <Entrada name="senha" type="password" autoComplete="current-password" required />
      </label>
      <Botao type="submit" disabled={pendente} className="w-full">
        {pendente ? "Entrando…" : "Entrar"}
      </Botao>
    </form>
  );
}
