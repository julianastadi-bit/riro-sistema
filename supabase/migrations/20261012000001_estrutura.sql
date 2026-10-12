-- RIRO · Sistema financeiro
-- 0001 · Estrutura base: cadastros, perfis, fechamento de caixa e contas a receber

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Tipos
-- ─────────────────────────────────────────────────────────────
create type public.papel_usuario as enum ('operacao', 'gerente', 'financeiro', 'admin');

create type public.status_fechamento as enum ('rascunho', 'enviado', 'conferido');

create type public.grupo_pagamento as enum (
  'dinheiro', 'credito', 'debito', 'pix', 'transferencia', 'boleto', 'cheque',
  'gift_card', 'voucher', 'permuta', 'cortesia', 'credito_utilizado', 'divida'
);

create type public.tipo_conta as enum ('banco', 'caixa');

-- Para onde o dinheiro de um recebível vai cair
--   caixa      → cofre/gaveta física (conferência por contagem)
--   banco      → conta bancária direta (Pix, transferência, boleto, cheque)
--   adquirente → liquidação da maquininha (Safrapay) na conta vinculada
--   cliente    → cliente deve ao salão (dívida/fiado)
create type public.destino_recebivel as enum ('caixa', 'banco', 'adquirente', 'cliente');

create type public.status_recebivel as enum ('previsto', 'conciliado', 'divergente', 'cancelado');

create type public.tipo_movimento_caixa as enum ('sangria', 'suprimento');

create type public.tipo_plano_conta as enum (
  'receita', 'deducao', 'custo', 'despesa', 'investimento', 'participacao', 'financeiro'
);

-- ─────────────────────────────────────────────────────────────
-- Cadastros
-- ─────────────────────────────────────────────────────────────
create table public.empresas (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  razao_social        text,
  cnpj                text unique,
  principal           boolean not null default false,
  ativo               boolean not null default true,
  -- contas padrão para onde cada destino de recebível é direcionado
  conta_caixa_id      uuid,
  conta_banco_id      uuid,
  conta_adquirente_id uuid,
  criado_em           timestamptz not null default now()
);

create table public.contas_financeiras (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  nome       text not null,
  tipo       public.tipo_conta not null,
  banco      text,
  agencia    text,
  numero     text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  unique (empresa_id, nome)
);

alter table public.empresas
  add constraint empresas_conta_caixa_fk      foreign key (conta_caixa_id)      references public.contas_financeiras (id),
  add constraint empresas_conta_banco_fk      foreign key (conta_banco_id)      references public.contas_financeiras (id),
  add constraint empresas_conta_adquirente_fk foreign key (conta_adquirente_id) references public.contas_financeiras (id);

create table public.adquirentes (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Formas de pagamento espelham as linhas do fechamento do Avec.
-- As flags definem como cada forma impacta faturamento, caixa e DRE.
create table public.formas_pagamento (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique,
  nome             text not null,
  grupo            public.grupo_pagamento not null,
  bandeira         text,
  adquirente_id    uuid references public.adquirentes (id),
  ordem            integer not null default 0,
  soma_total_avec  boolean not null default true,   -- compõe o "TOTAL FATURADO" do Avec
  gera_recebivel   boolean not null default true,   -- gera contas a receber ao enviar o fechamento
  receita_dre      boolean not null default true,   -- entra como receita na DRE (competência)
  destino          public.destino_recebivel,
  prazo_dias       integer not null default 0 check (prazo_dias >= 0),
  dias_uteis       boolean not null default false,  -- prazo contado em dias úteis
  taxa_percentual  numeric(6, 3) not null default 0 check (taxa_percentual >= 0 and taxa_percentual < 100),
  taxa_confirmada  boolean not null default false,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  constraint formas_destino_obrigatorio check (not gera_recebivel or destino is not null)
);

create table public.plano_contas (
  id        uuid primary key default gen_random_uuid(),
  codigo    text not null unique,
  nome      text not null,
  grupo     text not null,
  tipo      public.tipo_plano_conta not null,
  descricao text,
  ordem     integer not null default 0,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Usuários
-- ─────────────────────────────────────────────────────────────
create table public.perfis (
  id        uuid primary key references auth.users (id) on delete cascade,
  nome      text not null default '',
  email     text,
  papel     public.papel_usuario not null default 'operacao',
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Fechamento de caixa
-- ─────────────────────────────────────────────────────────────
create table public.fechamentos_caixa (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas (id),
  data             date not null,
  status           public.status_fechamento not null default 'rascunho',
  total_avec       numeric(14, 2) check (total_avec >= 0),       -- "TOTAL FATURADO" informado no Avec
  dinheiro_inicial numeric(14, 2) not null default 0 check (dinheiro_inicial >= 0),
  dinheiro_contado numeric(14, 2) check (dinheiro_contado >= 0), -- contagem física da gaveta
  observacoes      text,
  comprovante_path text,
  criado_por       uuid references public.perfis (id) default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_por   uuid references public.perfis (id),
  atualizado_em    timestamptz not null default now(),
  enviado_por      uuid references public.perfis (id),
  enviado_em       timestamptz,
  conferido_por    uuid references public.perfis (id),
  conferido_em     timestamptz,
  unique (empresa_id, data)
);

create table public.fechamento_itens (
  id                 uuid primary key default gen_random_uuid(),
  fechamento_id      uuid not null references public.fechamentos_caixa (id) on delete cascade,
  forma_pagamento_id uuid not null references public.formas_pagamento (id),
  quantidade         integer not null default 0 check (quantidade >= 0),
  valor              numeric(14, 2) not null default 0 check (valor >= 0),
  unique (fechamento_id, forma_pagamento_id)
);

create table public.movimentos_caixa (
  id            uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos_caixa (id) on delete cascade,
  tipo          public.tipo_movimento_caixa not null,
  valor         numeric(14, 2) not null check (valor > 0),
  descricao     text not null,
  criado_por    uuid references public.perfis (id) default auth.uid(),
  criado_em     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Contas a receber
-- ─────────────────────────────────────────────────────────────
create table public.recebiveis (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas (id),
  fechamento_id      uuid not null references public.fechamentos_caixa (id),
  forma_pagamento_id uuid not null references public.formas_pagamento (id),
  conta_id           uuid references public.contas_financeiras (id),
  destino            public.destino_recebivel not null,
  quantidade         integer not null default 0,
  data_venda         date not null,
  data_prevista      date not null,
  valor_bruto        numeric(14, 2) not null check (valor_bruto > 0),
  taxa_percentual    numeric(6, 3) not null default 0,
  valor_taxa         numeric(14, 2) generated always as (round(valor_bruto * taxa_percentual / 100, 2)) stored,
  valor_liquido      numeric(14, 2) generated always as (valor_bruto - round(valor_bruto * taxa_percentual / 100, 2)) stored,
  status             public.status_recebivel not null default 'previsto',
  valor_recebido     numeric(14, 2),
  data_recebimento   date,
  observacao         text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create index recebiveis_data_prevista_idx on public.recebiveis (data_prevista);
create index recebiveis_status_idx on public.recebiveis (status);
create index recebiveis_fechamento_idx on public.recebiveis (fechamento_id);
create index fechamentos_data_idx on public.fechamentos_caixa (data desc);

-- ─────────────────────────────────────────────────────────────
-- Auditoria
-- ─────────────────────────────────────────────────────────────
create table public.auditoria (
  id          bigint generated always as identity primary key,
  tabela      text not null,
  registro_id uuid,
  acao        text not null,
  usuario_id  uuid,
  dados_antes jsonb,
  dados_depois jsonb,
  motivo      text,
  criado_em   timestamptz not null default now()
);

create index auditoria_registro_idx on public.auditoria (tabela, registro_id);
