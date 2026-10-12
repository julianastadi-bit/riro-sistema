export type Papel = "operacao" | "gerente" | "financeiro" | "admin";
export type StatusFechamento = "rascunho" | "enviado" | "conferido";
export type StatusRecebivel = "previsto" | "conciliado" | "divergente" | "cancelado";
export type Destino = "caixa" | "banco" | "adquirente" | "cliente";
export type GrupoPagamento =
  | "dinheiro" | "credito" | "debito" | "pix" | "transferencia" | "boleto" | "cheque"
  | "gift_card" | "voucher" | "permuta" | "cortesia" | "credito_utilizado" | "divida";

export interface Perfil {
  id: string;
  nome: string;
  email: string | null;
  papel: Papel;
  ativo: boolean;
}

export interface Empresa {
  id: string;
  nome: string;
  razao_social: string | null;
  cnpj: string | null;
  principal: boolean;
  ativo: boolean;
  conta_caixa_id: string | null;
  conta_banco_id: string | null;
  conta_adquirente_id: string | null;
}

export interface ContaFinanceira {
  id: string;
  empresa_id: string;
  nome: string;
  tipo: "banco" | "caixa";
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  ativo: boolean;
}

export interface FormaPagamento {
  id: string;
  codigo: string;
  nome: string;
  grupo: GrupoPagamento;
  bandeira: string | null;
  ordem: number;
  soma_total_avec: boolean;
  gera_recebivel: boolean;
  receita_dre: boolean;
  destino: Destino | null;
  prazo_dias: number;
  dias_uteis: boolean;
  taxa_percentual: number;
  taxa_confirmada: boolean;
  ativo: boolean;
}

export interface Fechamento {
  id: string;
  empresa_id: string;
  data: string;
  status: StatusFechamento;
  total_avec: number | null;
  dinheiro_inicial: number;
  dinheiro_contado: number | null;
  observacoes: string | null;
  comprovante_path: string | null;
  enviado_em: string | null;
  conferido_em: string | null;
  atualizado_em: string;
}

export interface FechamentoItem {
  id: string;
  forma_pagamento_id: string;
  quantidade: number;
  valor: number;
}

export interface MovimentoCaixa {
  id: string;
  tipo: "sangria" | "suprimento";
  valor: number;
  descricao: string;
}

export const ROTULO_PAPEL: Record<Papel, string> = {
  operacao: "Operação",
  gerente: "Gerência",
  financeiro: "Financeiro",
  admin: "Administrador",
};

export const ROTULO_STATUS_FECHAMENTO: Record<StatusFechamento, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  conferido: "Conferido",
};

export const TOM_STATUS_FECHAMENTO = { rascunho: "amarelo", enviado: "azul", conferido: "verde" } as const;

export const ROTULO_STATUS_RECEBIVEL: Record<StatusRecebivel, string> = {
  previsto: "Previsto",
  conciliado: "Conciliado",
  divergente: "Divergente",
  cancelado: "Cancelado",
};

export const ROTULO_DESTINO: Record<Destino, string> = {
  caixa: "Caixa físico",
  banco: "Banco",
  adquirente: "Adquirente",
  cliente: "Cliente (fiado)",
};

export const ROTULO_GRUPO: Record<GrupoPagamento, string> = {
  dinheiro: "Dinheiro",
  credito: "Cartão Crédito",
  debito: "Cartão Débito",
  cheque: "Cheque",
  boleto: "Boleto",
  transferencia: "Transferência",
  pix: "Pix",
  gift_card: "Gift Card",
  voucher: "Voucher",
  permuta: "Permuta",
  cortesia: "Cortesia",
  credito_utilizado: "Crédito utilizado",
  divida: "Dívidas",
};

// ─── Contas a pagar ───
export type FormaDespesa = "boleto" | "pix" | "transferencia" | "recibo" | "debito_automatico" | "cartao" | "dinheiro";
export type StatusContaPagar = "aberto" | "pago" | "cancelado";

export const ROTULO_FORMA_DESPESA: Record<FormaDespesa, string> = {
  boleto: "Boleto",
  pix: "Pix",
  transferencia: "Transferência",
  recibo: "Recibo",
  debito_automatico: "Débito automático",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
};

export interface Fornecedor {
  id: string;
  nome: string;
  documento: string | null;
  plano_conta_id: string | null;
  forma_padrao: FormaDespesa | null;
  chave_pix: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export interface PlanoConta {
  id: string;
  codigo: string;
  nome: string;
  grupo: string;
  tipo: string;
  ativo: boolean;
}

export interface ContaPagar {
  id: string;
  empresa_id: string;
  fornecedor_id: string;
  plano_conta_id: string;
  descricao: string;
  documento: string | null;
  forma: FormaDespesa;
  data_lancamento: string;
  competencia: string;
  data_vencimento: string;
  valor: number;
  parcela: number | null;
  total_parcelas: number | null;
  grupo_id: string | null;
  codigo_barras: string | null;
  observacoes: string | null;
  status: StatusContaPagar;
  data_pagamento: string | null;
  conta_pagamento_id: string | null;
  juros_multa: number;
  desconto: number;
  valor_pago: number | null;
  motivo_cancelamento: string | null;
  boleto_path: string | null;
  comprovante_path: string | null;
  origem: "manual" | "planilha";
  pago_em: string | null;
}

/** Situação exibida: separa "vencida" e "vence hoje" das demais abertas */
export type Situacao = "vencida" | "hoje" | "aberta" | "paga" | "cancelada";
export function situacaoConta(c: Pick<ContaPagar, "status" | "data_vencimento">, hoje: string): Situacao {
  if (c.status === "pago") return "paga";
  if (c.status === "cancelado") return "cancelada";
  if (c.data_vencimento < hoje) return "vencida";
  if (c.data_vencimento === hoje) return "hoje";
  return "aberta";
}
export const ROTULO_SITUACAO: Record<Situacao, string> = {
  vencida: "Vencida",
  hoje: "Vence hoje",
  aberta: "Em aberto",
  paga: "Paga",
  cancelada: "Cancelada",
};
export const TOM_SITUACAO = {
  vencida: "vermelho",
  hoje: "amarelo",
  aberta: "azul",
  paga: "verde",
  cancelada: "neutro",
} as const;
