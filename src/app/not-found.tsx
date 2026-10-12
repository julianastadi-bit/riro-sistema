import { BotaoLink } from "@/components/ui";

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-cobre-700">404</p>
      <h1 className="text-2xl font-light">Página não encontrada</h1>
      <BotaoLink href="/" variante="secundario">Voltar ao painel</BotaoLink>
    </main>
  );
}
