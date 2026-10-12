import Image from "next/image";
import { FormularioLogin } from "./FormularioLogin";

export const metadata = { title: "Entrar" };

const mensagens: Record<string, string> = {
  inativo: "Seu acesso está desativado. Fale com a administração.",
};

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center">
          <Image src="/logo-riro.png" alt="RIRO" width={220} height={61} priority />
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-grafite/50">Gestão financeira</p>
        </div>
        <FormularioLogin erroInicial={erro ? mensagens[erro] : undefined} />
      </div>
    </main>
  );
}
