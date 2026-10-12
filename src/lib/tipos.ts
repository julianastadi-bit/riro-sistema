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
