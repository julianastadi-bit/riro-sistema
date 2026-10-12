"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, ClipboardCheck, HandCoins, Settings2, Users, Receipt,
  GitCompareArrows, TrendingUp, FileBarChart, LogOut, Menu, X,
} from "lucide-react";
import type { Papel, Perfil } from "@/lib/tipos";
import { ROTULO_PAPEL } from "@/lib/tipos";
import { cx } from "@/components/ui";

type Item = { href: string; rotulo: string; icone: typeof LayoutDashboard; papeis?: Papel[]; emBreve?: boolean };

const GERENCIA: Papel[] = ["gerente", "financeiro", "admin"];

const itens: Item[] = [
  { href: "/", rotulo: "Painel", icone: LayoutDashboard },
  { href: "/fechamentos", rotulo: "Fechamento de caixa", icone: ClipboardCheck },
  { href: "/recebiveis", rotulo: "Contas a receber", icone: HandCoins, papeis: GERENCIA },
  { href: "/pagar", rotulo: "Contas a pagar", icone: Receipt, papeis: GERENCIA },
  { href: "#", rotulo: "Conciliação", icone: GitCompareArrows, papeis: GERENCIA, emBreve: true },
  { href: "#", rotulo: "Fluxo de caixa", icone: TrendingUp, papeis: GERENCIA, emBreve: true },
  { href: "#", rotulo: "DRE", icone: FileBarChart, papeis: GERENCIA, emBreve: true },
  { href: "/cadastros", rotulo: "Cadastros", icone: Settings2, papeis: ["financeiro", "admin"] },
  { href: "/usuarios", rotulo: "Usuários", icone: Users, papeis: ["admin"] },
];

function Navegacao({ perfil, aoNavegar }: { perfil: Perfil; aoNavegar?: () => void }) {
  const caminho = usePathname();
  const visiveis = itens.filter((i) => !i.papeis || i.papeis.includes(perfil.papel));
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {visiveis.map((i) => {
        const ativo = i.href === "/" ? caminho === "/" : caminho.startsWith(i.href) && i.href !== "#";
        const Icone = i.icone;
        if (i.emBreve) {
          return (
            <span key={i.rotulo} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/35">
              <Icone size={17} strokeWidth={1.6} />
              {i.rotulo}
              <span className="ml-auto text-[10px] uppercase tracking-wider">em breve</span>
            </span>
          );
        }
        return (
          <Link
            key={i.rotulo}
            href={i.href}
            onClick={aoNavegar}
            className={cx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              ativo ? "bg-white/12 text-white" : "text-white/75 hover:bg-white/8 hover:text-white",
            )}
          >
            <Icone size={17} strokeWidth={1.6} />
            {i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

function Rodape({ perfil }: { perfil: Perfil }) {
  return (
    <div className="border-t border-white/10 px-5 py-4">
      <p className="truncate text-sm text-white">{perfil.nome || perfil.email}</p>
      <p className="text-xs text-white/55">{ROTULO_PAPEL[perfil.papel]}</p>
      <form action="/sair" method="post" className="mt-3">
        <button className="flex items-center gap-2 text-xs text-white/65 hover:text-white">
          <LogOut size={14} /> Sair
        </button>
      </form>
    </div>
  );
}

export function Estrutura({ perfil, children }: { perfil: Perfil; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Lateral (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-grafite lg:flex">
        <div className="px-6 pb-8 pt-7">
          <Image src="/logo-riro-branco.png" alt="RIRO" width={110} height={31} />
          <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-cobre-300">Financeiro</p>
        </div>
        <Navegacao perfil={perfil} />
        <Rodape perfil={perfil} />
      </aside>

      {/* Topo (celular) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-linha bg-creme/95 px-4 backdrop-blur lg:hidden">
        <Image src="/logo-riro.png" alt="RIRO" width={84} height={23} />
        <button aria-label="Abrir menu" onClick={() => setAberto(true)} className="rounded-lg p-2 text-grafite hover:bg-cobre-50">
          <Menu size={22} />
        </button>
      </header>

      {aberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAberto(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-grafite">
            <div className="flex items-center justify-between px-5 pb-6 pt-5">
              <Image src="/logo-riro-branco.png" alt="RIRO" width={90} height={25} />
              <button aria-label="Fechar menu" onClick={() => setAberto(false)} className="p-1 text-white/80">
                <X size={22} />
              </button>
            </div>
            <Navegacao perfil={perfil} aoNavegar={() => setAberto(false)} />
            <Rodape perfil={perfil} />
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
