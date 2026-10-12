import { Aviso, Botao, Cabecalho, Cartao, Entrada, Selecao, Selo, cx } from "@/components/ui";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Papel, Perfil } from "@/lib/tipos";
import { ROTULO_PAPEL } from "@/lib/tipos";
import { atualizarUsuario, criarUsuario } from "./actions";

export const metadata = { title: "Usuários" };

const DESCRICAO: Record<Papel, string> = {
  operacao: "Lança o fechamento diário. Não vê recebíveis nem relatórios.",
  gerente: "Acompanha fechamentos e contas a receber.",
  financeiro: "Confere, reabre, concilia e mantém cadastros.",
  admin: "Acesso total, incluindo usuários.",
};

export default async function PaginaUsuarios({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const eu = await exigirPerfil("admin");
  const sp = await searchParams;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("perfis").select("id, nome, email, papel, ativo").order("nome");
  const usuarios = (data ?? []) as Perfil[];
  const opcoesPapel = (Object.keys(ROTULO_PAPEL) as Papel[]).map((p) => (
    <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>
  ));

  return (
    <>
      <Cabecalho titulo="Usuários" subtitulo="Quem acessa o sistema e o que cada um pode fazer." />
      {sp.erro && <div className="mb-4"><Aviso tom="vermelho">{sp.erro}</Aviso></div>}
      {sp.ok && <div className="mb-4"><Aviso tom="verde">{sp.ok}</Aviso></div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Cartao>
          {usuarios.map((u) => (
            <details key={u.id} className="group border-b border-linha last:border-0">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-cobre-50/50 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span className={cx("text-sm font-medium", !u.ativo && "text-grafite/40 line-through")}>{u.nome || "—"}</span>
                <span className="text-xs text-grafite/55">{u.email}</span>
                <span className="ml-auto flex items-center gap-2">
                  {!u.ativo && <Selo tom="vermelho">inativo</Selo>}
                  <Selo tom={u.papel === "admin" ? "cobre" : "neutro"}>{ROTULO_PAPEL[u.papel]}</Selo>
                </span>
              </summary>
              <form action={atualizarUsuario} className="space-y-3 border-t border-linha/60 bg-creme/60 px-4 py-4 sm:px-5">
                <input type="hidden" name="id" value={u.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-grafite/55">Nome</span>
                    <Entrada name="nome" defaultValue={u.nome} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-grafite/55">Perfil</span>
                    <Selecao name="papel" defaultValue={u.papel}>{opcoesPapel}</Selecao>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-grafite/55">Nova senha (opcional)</span>
                    <Entrada name="senha" type="password" autoComplete="new-password" minLength={8} />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="ativo" defaultChecked={u.ativo} disabled={u.id === eu.id} className="size-4 accent-cobre-600" />
                  Acesso ativo
                  {u.id === eu.id && <input type="hidden" name="ativo" value="on" />}
                </label>
                <Botao type="submit">Salvar</Botao>
              </form>
            </details>
          ))}
        </Cartao>

        <div className="space-y-5">
          <Cartao className="p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-medium">Novo usuário</h3>
            <form action={criarUsuario} className="space-y-3">
              <Entrada name="nome" placeholder="Nome" required />
              <Entrada name="email" type="email" placeholder="E-mail" required />
              <Entrada name="senha" type="text" placeholder="Senha provisória (mín. 8)" minLength={8} required />
              <Selecao name="papel" defaultValue="operacao">{opcoesPapel}</Selecao>
              <Botao type="submit" className="w-full">Criar acesso</Botao>
            </form>
          </Cartao>
          <Cartao className="space-y-3 p-4 text-sm sm:p-5">
            {(Object.keys(DESCRICAO) as Papel[]).map((p) => (
              <div key={p}>
                <p className="font-medium">{ROTULO_PAPEL[p]}</p>
                <p className="text-xs text-grafite/60">{DESCRICAO[p]}</p>
              </div>
            ))}
          </Cartao>
        </div>
      </div>
    </>
  );
}
