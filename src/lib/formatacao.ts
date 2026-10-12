const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatarMoeda = (v: number | null | undefined) => moeda.format(Number(v ?? 0));
export const formatarNumero = (v: number | null | undefined) => numero.format(Number(v ?? 0));

/**
 * Lê valores digitados no padrão brasileiro. Vazio → null.
 *   "1.234,56" → 1234.56   "21.380" → 21380   "1.250.000" → 1250000
 *   "1234,5"   → 1234.5    "1234.56" → 1234.56 (ponto decimal só quando não parece milhar)
 */
export function lerValor(texto: string): number | null {
  const limpo = texto.replace(/[R$\s]/g, "");
  if (!limpo) return null;
  let normalizado: string;
  if (limpo.includes(",")) normalizado = limpo.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) normalizado = limpo.replace(/\./g, "");
  else normalizado = limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** "2026-10-09" → "09/10/2026" (sem conversão de fuso) */
export function formatarData(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const diasSemana = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export function diaSemana(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return diasSemana[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

export function formatarDataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Data de hoje em São Paulo no formato ISO (AAAA-MM-DD) */
export function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** Centavos para evitar erro de ponto flutuante em somas */
export const somar = (valores: number[]) => valores.reduce((s, v) => s + Math.round(v * 100), 0) / 100;

/** Soma meses mantendo o dia (31/01 + 1 mês → 28/02 ou 29/02) */
export function somarMeses(iso: string, meses: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimoDia))).toISOString().slice(0, 10);
}

/** "2026-10-01" → "out/2026" */
export function formatarMes(iso: string | null | undefined) {
  if (!iso) return "—";
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
}
