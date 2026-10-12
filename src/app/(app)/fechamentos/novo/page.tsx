import { Aviso, Botao, Cabecalho, Cartao, Entrada, Selecao } from "@/components/ui";
import { exigirPerfil } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/formatacao";
import { criarFechamento } from "../actions";

export const metadata = { title: "Lançar fechamento" };

export default async function PaginaNovoFechamento({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; data?: string; erro?: string }>;
}) {
  await exigirPerfil();
  const sp = await searchParams;
  const supabase = await criarClienteServidor();
  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, nome, principal")
    .eq("ativo", true)
    .order("principal", { ascending: false });
  const hoje = hojeSP();

  return (
    <>
      <Cabecalho titulo="Lançar fechamento" subtitulo="Escolha a empresa e o dia. Se já existir lançamento, ele será aberto." />
      <Cartao className="max-w-md p-5">
        <form action={criarFechamento} className="space-y-4">
          {sp.erro && <Aviso tom="vermelho">Não foi possível criar o fechamento. {sp.erro !== "dados" && sp.erro}</Aviso>}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-grafite/60">Empresa</span>
            <Selecao name="empresa_id" defaultValue={sp.empresa ?? empresas?.[0]?.id} required>
              {empresas?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </Selecao>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-grafite/60">Data do caixa</span>
            <Entrada name="data" type="date" max={hoje} defaultValue={sp.data ?? hoje} required />
          </label>
          <Botao type="submit" className="w-full">
            Continuar
          </Botao>
        </form>
      </Cartao>
    </>
  );
}
