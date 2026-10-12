import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Cabecalho } from "@/components/ui";
import { exigirPerfil } from "@/lib/perfil";
import { Importador } from "./Importador";

export const metadata = { title: "Importar planilha" };

export default async function PaginaImportar() {
  await exigirPerfil("financeiro", "admin");
  return (
    <div className="max-w-5xl">
      <Link href="/pagar" className="mb-4 inline-flex items-center gap-1 text-sm text-cobre-700 hover:underline">
        <ChevronLeft size={16} /> Contas a pagar
      </Link>
      <Cabecalho
        titulo="Importar da planilha"
        subtitulo="Traz os lançamentos da aba PAGTO. Linhas com OK entram como pagas, na conta do banco indicado."
      />
      <Importador />
    </div>
  );
}
