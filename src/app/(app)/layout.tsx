import { Estrutura } from "@/components/Estrutura";
import { exigirPerfil } from "@/lib/perfil";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil();
  return <Estrutura perfil={perfil}>{children}</Estrutura>;
}
