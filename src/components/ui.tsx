import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

export function Cabecalho({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-light tracking-wide text-grafite">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-grafite/60">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Cartao({ className, children, ...p }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-xl border border-linha bg-white shadow-[0_1px_2px_rgba(43,37,34,0.04)]", className)} {...p}>
      {children}
    </div>
  );
}

export function TituloCartao({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-linha px-4 py-3 sm:px-5">
      <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-cobre-700">{children}</h2>
      {acao}
    </div>
  );
}

type Variante = "primario" | "secundario" | "perigo" | "fantasma";
const estilosBotao: Record<Variante, string> = {
  primario: "bg-cobre-600 text-white hover:bg-cobre-700 disabled:bg-cobre-300",
  secundario: "border border-linha bg-white text-grafite hover:border-cobre-300 hover:bg-cobre-50 disabled:text-grafite/40",
  perigo: "border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:text-red-300",
  fantasma: "text-cobre-700 hover:bg-cobre-50",
};
const baseBotao =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobre-500 disabled:cursor-not-allowed";

export function Botao({ variante = "primario", className, ...p }: ComponentProps<"button"> & { variante?: Variante }) {
  return <button className={cx(baseBotao, estilosBotao[variante], className)} {...p} />;
}

export function BotaoLink({ variante = "primario", className, ...p }: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={cx(baseBotao, estilosBotao[variante], className)} {...p} />;
}

const estiloCampo =
  "w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-grafite placeholder:text-grafite/35 focus:border-cobre-400 focus:outline-none focus:ring-2 focus:ring-cobre-100 disabled:bg-creme disabled:text-grafite/60";

export function Entrada({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(estiloCampo, className)} {...p} />;
}

export function Selecao({ className, ...p }: ComponentProps<"select">) {
  return <select className={cx(estiloCampo, "pr-8", className)} {...p} />;
}

export function AreaTexto({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(estiloCampo, className)} {...p} />;
}

export function Rotulo({ children, dica, ...p }: ComponentProps<"label"> & { dica?: ReactNode }) {
  return (
    <label className="block space-y-1.5" {...p}>
      <span className="block text-xs font-medium uppercase tracking-wider text-grafite/60">{children}</span>
      {dica && <span className="block text-xs text-grafite/50">{dica}</span>}
    </label>
  );
}

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-wider text-grafite/60">{rotulo}</span>
      {children}
      {dica && <span className="block text-xs text-grafite/50">{dica}</span>}
    </div>
  );
}

type Tom = "neutro" | "cobre" | "verde" | "amarelo" | "vermelho" | "azul";
const tons: Record<Tom, string> = {
  neutro: "bg-stone-100 text-stone-700",
  cobre: "bg-cobre-100 text-cobre-800",
  verde: "bg-emerald-50 text-emerald-800",
  amarelo: "bg-amber-50 text-amber-800",
  vermelho: "bg-red-50 text-red-700",
  azul: "bg-sky-50 text-sky-800",
};

export function Selo({ tom = "neutro", children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tons[tom])}>
      {children}
    </span>
  );
}

export function Aviso({ tom = "amarelo", children }: { tom?: "amarelo" | "vermelho" | "verde" | "azul"; children: ReactNode }) {
  const c = {
    amarelo: "border-amber-200 bg-amber-50 text-amber-900",
    vermelho: "border-red-200 bg-red-50 text-red-800",
    verde: "border-emerald-200 bg-emerald-50 text-emerald-900",
    azul: "border-sky-200 bg-sky-50 text-sky-900",
  }[tom];
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", c)}>{children}</div>;
}

export function Indicador({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: "alerta" }) {
  return (
    <Cartao className="p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-grafite/55">{rotulo}</p>
      <p className={cx("num mt-2 text-2xl font-light", tom === "alerta" ? "text-red-700" : "text-grafite")}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-grafite/55">{detalhe}</p>}
    </Cartao>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-grafite/50">{children}</div>;
}
