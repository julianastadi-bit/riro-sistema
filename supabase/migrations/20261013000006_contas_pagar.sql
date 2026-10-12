-- RIRO · Sistema financeiro
-- 0006 · Contas a pagar: fornecedores, lançamentos, baixa, estorno, cancelamento e importação da aba PAGTO

create type public.forma_despesa as enum (
  'boleto', 'pix', 'transferencia', 'recibo', 'debito_automatico', 'cartao', 'dinheiro'
);

create type public.status_conta_pagar as enum ('aberto', 'pago', 'cancelado');

-- ─────────────────────────────────────────────────────────────
-- Fornecedores
-- ─────────────────────────────────────────────────────────────
create table public.fornecedores (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  documento      text,                                       -- CNPJ/CPF
  plano_conta_id uuid references public.plano_contas (id),   -- categoria sugerida
  forma_padrao   public.forma_despesa,
  chave_pix      text,
  observacoes    text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now()
);

create unique index fornecedores_nome_idx on public.fornecedores (upper(trim(nome)));

-- Conta para lançamentos ainda sem categoria definida (ex.: vindos da planilha)
insert into public.plano_contas (codigo, nome, grupo, tipo, ordem, descricao)
values ('9.01', 'A classificar', 'A classificar', 'despesa', 901, 'Lançamentos sem categoria; reclassificar antes de fechar o mês')
on conflict (codigo) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Contas a pagar
-- ─────────────────────────────────────────────────────────────
create table public.contas_pagar (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas (id),      -- empresa dona da despesa (DRE)
  fornecedor_id       uuid not null references public.fornecedores (id),
  plano_conta_id      uuid not null references public.plano_contas (id),
  descricao           text not null,
  documento           text,                                               -- nº do boleto/NF/recibo
  forma               public.forma_despesa not null default 'boleto',
  data_lancamento     date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  competencia         date not null,                                      -- 1º dia do mês de referência (DRE)
  data_vencimento     date not null,
  valor               numeric(14, 2) not null check (valor > 0),
  parcela             integer check (parcela > 0),
  total_parcelas      integer check (total_parcelas > 0),
  grupo_id            uuid,                                               -- liga parcelas/recorrências
  codigo_barras       text,
  observacoes         text,
  status              public.status_conta_pagar not null default 'aberto',
  -- baixa
  data_pagamento      date,
  conta_pagamento_id  uuid references public.contas_financeiras (id),    -- pode ser de outra empresa
  juros_multa         numeric(14, 2) not null default 0 check (juros_multa >= 0),
  desconto            numeric(14, 2) not null default 0 check (desconto >= 0),
  valor_pago          numeric(14, 2) generated always as (
                        case when status = 'pago' then valor + juros_multa - desconto end
                      ) stored,
  pago_por            uuid references public.perfis (id),
  pago_em             timestamptz,
  motivo_cancelamento text,
  -- anexos
  boleto_path         text,
  comprovante_path    text,
  -- origem
  origem              text not null default 'manual' check (origem in ('manual', 'planilha')),
  chave_importacao    text unique,
  criado_por          uuid references public.perfis (id) default auth.uid(),
  criado_em           timestamptz not null default now(),
  atualizado_por      uuid references public.perfis (id),
  atualizado_em       timestamptz not null default now(),
  constraint competencia_primeiro_dia check (extract(day from competencia) = 1),
  constraint parcela_valida check (parcela is null or total_parcelas is null or parcela <= total_parcelas),
  constraint pago_com_baixa check (status <> 'pago' or (data_pagamento is not null and conta_pagamento_id is not null)),
  constraint desconto_menor_que_valor check (desconto < valor)
);

create index contas_pagar_vencimento_idx on public.contas_pagar (data_vencimento);
create index contas_pagar_status_idx on public.contas_pagar (status);
create index contas_pagar_empresa_idx on public.contas_pagar (empresa_id);
create index contas_pagar_fornecedor_idx on public.contas_pagar (fornecedor_id);
create index contas_pagar_grupo_idx on public.contas_pagar (grupo_id);

-- ─────────────────────────────────────────────────────────────
-- Proteção: conta paga/cancelada só muda pelas funções.
-- Exceção: anexar comprovante numa conta já paga.
-- ─────────────────────────────────────────────────────────────
create or replace function public.proteger_conta_pagar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.em_transicao() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'aberto' then
      raise exception 'Conta a pagar deve ser criada em aberto';
    end if;
    new.criado_por := auth.uid();
    new.data_pagamento := null; new.conta_pagamento_id := null;
    new.pago_por := null; new.pago_em := null;
    new.juros_multa := 0; new.desconto := 0;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'aberto' then
      raise exception 'Somente contas em aberto podem ser excluídas; use cancelar ou estornar';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'pago'
     and (to_jsonb(new) - 'comprovante_path' - 'atualizado_por' - 'atualizado_em' - 'valor_pago')
       = (to_jsonb(old) - 'comprovante_path' - 'atualizado_por' - 'atualizado_em' - 'valor_pago') then
    new.atualizado_por := auth.uid();
    new.atualizado_em := now();
    return new;
  end if;
  if old.status = 'pago' then
    raise exception 'Conta já paga: estorne o pagamento antes de alterar';
  end if;
  if old.status = 'cancelado' then
    raise exception 'Conta cancelada não pode ser alterada';
  end if;
  if new.status is distinct from old.status
     or new.data_pagamento is distinct from old.data_pagamento
     or new.conta_pagamento_id is distinct from old.conta_pagamento_id
     or new.juros_multa is distinct from old.juros_multa
     or new.desconto is distinct from old.desconto
     or new.pago_por is distinct from old.pago_por
     or new.criado_por is distinct from old.criado_por
     or new.origem is distinct from old.origem
     or new.chave_importacao is distinct from old.chave_importacao then
    raise exception 'Use as ações de pagar, estornar ou cancelar para mudar a situação da conta';
  end if;
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger proteger_conta_pagar
  before insert or update or delete on public.contas_pagar
  for each row execute function public.proteger_conta_pagar();

-- ─────────────────────────────────────────────────────────────
-- Ações
-- ─────────────────────────────────────────────────────────────

-- Baixa de uma ou várias contas. Juros/desconto só na baixa individual.
create or replace function public.pagar_contas(
  p_ids uuid[],
  p_data date,
  p_conta uuid,
  p_juros numeric default 0,
  p_desconto numeric default 0
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_qtd integer;
begin
  if not public.tem_papel('financeiro', 'admin') then
    raise exception 'Somente o financeiro pode registrar pagamentos';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Selecione ao menos uma conta';
  end if;
  if p_data is null or p_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Data de pagamento inválida (não pode ser futura)';
  end if;
  if not exists (select 1 from public.contas_financeiras where id = p_conta and ativo) then
    raise exception 'Conta de pagamento inválida';
  end if;
  if array_length(p_ids, 1) > 1 and (coalesce(p_juros, 0) <> 0 or coalesce(p_desconto, 0) <> 0) then
    raise exception 'Juros e desconto só podem ser informados no pagamento individual';
  end if;
  if coalesce(p_juros, 0) < 0 or coalesce(p_desconto, 0) < 0 then
    raise exception 'Juros e desconto não podem ser negativos';
  end if;

  perform 1 from public.contas_pagar where id = any (p_ids) for update;
  if exists (select 1 from public.contas_pagar where id = any (p_ids) and status <> 'aberto') then
    raise exception 'Há contas selecionadas que não estão em aberto';
  end if;

  perform set_config('riro.transicao', 'on', true);
  update public.contas_pagar
     set status = 'pago', data_pagamento = p_data, conta_pagamento_id = p_conta,
         juros_multa = coalesce(p_juros, 0), desconto = coalesce(p_desconto, 0),
         pago_por = auth.uid(), pago_em = now(),
         atualizado_por = auth.uid(), atualizado_em = now()
   where id = any (p_ids);
  get diagnostics v_qtd = row_count;
  perform set_config('riro.transicao', 'off', true);

  if v_qtd <> array_length(p_ids, 1) then
    raise exception 'Algumas contas não foram encontradas';
  end if;
  return v_qtd;
end;
$$;

create or replace function public.estornar_pagamento(p_id uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_status public.status_conta_pagar;
begin
  if not public.tem_papel('financeiro', 'admin') then
    raise exception 'Somente o financeiro pode estornar pagamentos';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno';
  end if;
  select status into v_status from public.contas_pagar where id = p_id for update;
  if v_status is distinct from 'pago' then
    raise exception 'Somente contas pagas podem ser estornadas';
  end if;

  perform set_config('riro.transicao', 'on', true);
  update public.contas_pagar
     set status = 'aberto', data_pagamento = null, conta_pagamento_id = null,
         juros_multa = 0, desconto = 0, pago_por = null, pago_em = null,
         atualizado_por = auth.uid(), atualizado_em = now()
   where id = p_id;
  insert into public.auditoria (tabela, registro_id, acao, usuario_id, motivo)
  values ('contas_pagar', p_id, 'ESTORNO', auth.uid(), p_motivo);
  perform set_config('riro.transicao', 'off', true);
end;
$$;

create or replace function public.cancelar_conta_pagar(p_id uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_status public.status_conta_pagar;
begin
  if not public.tem_papel('financeiro', 'admin') then
    raise exception 'Somente o financeiro pode cancelar contas';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento';
  end if;
  select status into v_status from public.contas_pagar where id = p_id for update;
  if v_status is distinct from 'aberto' then
    raise exception 'Somente contas em aberto podem ser canceladas';
  end if;

  perform set_config('riro.transicao', 'on', true);
  update public.contas_pagar
     set status = 'cancelado', motivo_cancelamento = p_motivo,
         atualizado_por = auth.uid(), atualizado_em = now()
   where id = p_id;
  insert into public.auditoria (tabela, registro_id, acao, usuario_id, motivo)
  values ('contas_pagar', p_id, 'CANCELAMENTO', auth.uid(), p_motivo);
  perform set_config('riro.transicao', 'off', true);
end;
$$;

-- Importação da aba PAGTO. Recebe as linhas já interpretadas pelo app.
-- Idempotente: linhas com chave_importacao já existente são ignoradas.
create or replace function public.importar_contas_pagar(p_itens jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  it jsonb;
  v_empresa uuid;
  v_fornecedor uuid;
  v_plano uuid;
  v_plano_padrao uuid := (select id from public.plano_contas where codigo = '9.01');
  v_conta uuid;
  v_id uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inseridas integer := 0;
  v_pagas integer := 0;
  v_existentes integer := 0;
  v_novos_fornecedores integer := 0;
  v_avisos jsonb := '[]'::jsonb;
begin
  if not public.tem_papel('financeiro', 'admin') then
    raise exception 'Somente o financeiro pode importar contas';
  end if;

  perform set_config('riro.transicao', 'on', true);

  for it in select * from jsonb_array_elements(p_itens) loop
    if exists (select 1 from public.contas_pagar where chave_importacao = it ->> 'chave') then
      v_existentes := v_existentes + 1;
      continue;
    end if;

    select id into v_empresa from public.empresas
     where upper(replace(razao_social, ' ', '')) = upper(replace(it ->> 'empresa', ' ', ''));
    if v_empresa is null then
      v_avisos := v_avisos || jsonb_build_object('linha', it -> 'linha', 'aviso', 'Empresa não encontrada: ' || (it ->> 'empresa'));
      continue;
    end if;

    select id into v_fornecedor from public.fornecedores where upper(trim(nome)) = upper(trim(it ->> 'fornecedor'));
    if v_fornecedor is null then
      insert into public.fornecedores (nome) values (trim(it ->> 'fornecedor')) returning id into v_fornecedor;
      v_novos_fornecedores := v_novos_fornecedores + 1;
    end if;

    select id into v_plano from public.plano_contas where codigo = it ->> 'plano_codigo';
    if v_plano is null then
      v_plano := v_plano_padrao;
    end if;

    insert into public.contas_pagar (
      empresa_id, fornecedor_id, plano_conta_id, descricao, documento, forma,
      data_lancamento, competencia, data_vencimento, valor, parcela, total_parcelas,
      origem, chave_importacao, criado_por
    ) values (
      v_empresa, v_fornecedor, v_plano, it ->> 'descricao', nullif(it ->> 'documento', ''),
      (it ->> 'forma')::public.forma_despesa,
      (it ->> 'data_lancamento')::date, (it ->> 'competencia')::date, (it ->> 'vencimento')::date,
      (it ->> 'valor')::numeric, (it ->> 'parcela')::integer, (it ->> 'total_parcelas')::integer,
      'planilha', it ->> 'chave', auth.uid()
    ) returning id into v_id;
    v_inseridas := v_inseridas + 1;

    if (it ->> 'pago')::boolean then
      v_conta := null;
      if it ->> 'banco' = 'DINHEIRO' then
        select id into v_conta from public.contas_financeiras
         where empresa_id = v_empresa and tipo = 'caixa' and ativo order by criado_em limit 1;
      elsif coalesce(it ->> 'banco', '') <> '' then
        -- o banco pode ser de qualquer empresa (ex.: despesa da R. Rodrigues paga pelo Santander)
        select c.id into v_conta from public.contas_financeiras c
         where c.ativo and c.tipo = 'banco' and upper(c.banco) = upper(it ->> 'banco')
         order by (c.empresa_id = v_empresa) desc, c.criado_em limit 1;
      end if;

      if v_conta is null then
        v_avisos := v_avisos || jsonb_build_object('linha', it -> 'linha',
          'aviso', 'Marcada como paga na planilha, mas sem banco identificado: ficou em aberto');
      else
        update public.contas_pagar
           set status = 'pago', conta_pagamento_id = v_conta,
               data_pagamento = least((it ->> 'vencimento')::date, v_hoje),
               pago_por = auth.uid(), pago_em = now()
         where id = v_id;
        v_pagas := v_pagas + 1;
      end if;
    end if;
  end loop;

  perform set_config('riro.transicao', 'off', true);

  return jsonb_build_object(
    'inseridas', v_inseridas, 'pagas', v_pagas, 'existentes', v_existentes,
    'novos_fornecedores', v_novos_fornecedores, 'avisos', v_avisos
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Auditoria e permissões
-- ─────────────────────────────────────────────────────────────
create trigger auditoria after insert or update or delete on public.fornecedores
  for each row execute function public.registrar_auditoria();
create trigger auditoria after insert or update or delete on public.contas_pagar
  for each row execute function public.registrar_auditoria();

alter table public.fornecedores enable row level security;
alter table public.contas_pagar enable row level security;

create policy leitura on public.fornecedores for select to authenticated
  using (public.tem_papel('gerente', 'financeiro', 'admin'));
create policy insercao on public.fornecedores for insert to authenticated
  with check (public.tem_papel('financeiro', 'admin'));
create policy edicao on public.fornecedores for update to authenticated
  using (public.tem_papel('financeiro', 'admin')) with check (public.tem_papel('financeiro', 'admin'));

create policy leitura on public.contas_pagar for select to authenticated
  using (public.tem_papel('gerente', 'financeiro', 'admin'));
create policy insercao on public.contas_pagar for insert to authenticated
  with check (public.tem_papel('financeiro', 'admin'));
create policy edicao on public.contas_pagar for update to authenticated
  using (public.tem_papel('financeiro', 'admin')) with check (public.tem_papel('financeiro', 'admin'));
create policy exclusao on public.contas_pagar for delete to authenticated
  using (public.tem_papel('financeiro', 'admin'));

-- histórico de estornos/cancelamentos visível para quem vê a conta
create policy leitura_contas_pagar on public.auditoria for select to authenticated
  using (tabela = 'contas_pagar' and acao in ('ESTORNO', 'CANCELAMENTO') and public.tem_papel('gerente', 'financeiro', 'admin'));

revoke execute on function public.pagar_contas(uuid[], date, uuid, numeric, numeric) from public, anon;
revoke execute on function public.estornar_pagamento(uuid, text) from public, anon;
revoke execute on function public.cancelar_conta_pagar(uuid, text) from public, anon;
revoke execute on function public.importar_contas_pagar(jsonb) from public, anon;
grant execute on function public.pagar_contas(uuid[], date, uuid, numeric, numeric) to authenticated;
grant execute on function public.estornar_pagamento(uuid, text) to authenticated;
grant execute on function public.cancelar_conta_pagar(uuid, text) to authenticated;
grant execute on function public.importar_contas_pagar(jsonb) to authenticated;

-- Boletos e comprovantes de pagamento (privado)
insert into storage.buckets (id, name, public)
values ('contas-pagar', 'contas-pagar', false)
on conflict (id) do nothing;

create policy "contas_pagar_leitura" on storage.objects for select to authenticated
  using (bucket_id = 'contas-pagar' and public.tem_papel('gerente', 'financeiro', 'admin'));
create policy "contas_pagar_envio" on storage.objects for insert to authenticated
  with check (bucket_id = 'contas-pagar' and public.tem_papel('financeiro', 'admin'));
