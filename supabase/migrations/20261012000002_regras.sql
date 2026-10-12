-- RIRO · Sistema financeiro
-- 0002 · Regras de negócio: permissões, transições do fechamento, geração de recebíveis, auditoria

-- ─────────────────────────────────────────────────────────────
-- Papel do usuário logado
-- ─────────────────────────────────────────────────────────────
create or replace function public.papel_atual()
returns public.papel_usuario
language sql stable security definer
set search_path = public
as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.tem_papel(variadic papeis public.papel_usuario[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.papel_atual() = any (papeis), false)
$$;

-- Perfil criado automaticamente no cadastro do usuário (sempre como 'operacao';
-- a promoção de papel é feita por um admin).
create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- ─────────────────────────────────────────────────────────────
-- Datas
-- ─────────────────────────────────────────────────────────────
-- Soma dias corridos ou úteis (seg–sex). Feriados entram numa fase futura.
create or replace function public.calcular_data_prevista(p_data date, p_dias integer, p_uteis boolean)
returns date
language plpgsql immutable
as $$
declare
  d date := p_data;
  restantes integer := p_dias;
begin
  if not p_uteis then
    return p_data + p_dias;
  end if;
  while restantes > 0 loop
    d := d + 1;
    if extract(isodow from d) < 6 then
      restantes := restantes - 1;
    end if;
  end loop;
  return d;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Proteção do fechamento: só se edita em rascunho, e o status
-- só muda pelas funções de transição.
-- ─────────────────────────────────────────────────────────────
create or replace function public.em_transicao()
returns boolean
language sql stable
as $$
  select coalesce(current_setting('riro.transicao', true), '') = 'on'
$$;

create or replace function public.proteger_fechamento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.em_transicao() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' then
      raise exception 'Fechamento deve ser criado como rascunho';
    end if;
    new.criado_por := auth.uid();
    new.enviado_por := null; new.enviado_em := null;
    new.conferido_por := null; new.conferido_em := null;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'Somente fechamentos em rascunho podem ser excluídos';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status <> 'rascunho' then
    raise exception 'Fechamento % não pode ser alterado (status: %). Peça ao financeiro para reabrir.', old.data, old.status;
  end if;
  if new.status is distinct from old.status
     or new.enviado_por is distinct from old.enviado_por
     or new.conferido_por is distinct from old.conferido_por
     or new.criado_por is distinct from old.criado_por
     or new.empresa_id is distinct from old.empresa_id then
    raise exception 'Alteração não permitida neste campo';
  end if;
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger proteger_fechamento
  before insert or update or delete on public.fechamentos_caixa
  for each row execute function public.proteger_fechamento();

create or replace function public.proteger_filhos_fechamento()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status public.status_fechamento;
  v_id uuid := case when tg_op = 'DELETE' then old.fechamento_id else new.fechamento_id end;
begin
  if public.em_transicao() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select status into v_status from public.fechamentos_caixa where id = v_id;
  -- exclusão em cascata de um rascunho: o pai já não existe
  if v_status is null and tg_op = 'DELETE' then
    return old;
  end if;
  if v_status is distinct from 'rascunho' then
    raise exception 'Fechamento não está em rascunho; alteração bloqueada';
  end if;
  if tg_op = 'UPDATE' and new.fechamento_id <> old.fechamento_id then
    raise exception 'Não é permitido mover itens entre fechamentos';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger proteger_itens
  before insert or update or delete on public.fechamento_itens
  for each row execute function public.proteger_filhos_fechamento();

create trigger proteger_movimentos
  before insert or update or delete on public.movimentos_caixa
  for each row execute function public.proteger_filhos_fechamento();

-- ─────────────────────────────────────────────────────────────
-- Transições do fechamento
-- ─────────────────────────────────────────────────────────────

-- Rascunho → Enviado. Valida o total contra o Avec e gera o contas a receber.
create or replace function public.enviar_fechamento(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  f public.fechamentos_caixa;
  e public.empresas;
  v_total numeric(14, 2);
begin
  if public.papel_atual() is null then
    raise exception 'Usuário sem permissão';
  end if;

  select * into f from public.fechamentos_caixa where id = p_id for update;
  if not found then raise exception 'Fechamento não encontrado'; end if;
  if f.status <> 'rascunho' then raise exception 'Fechamento já foi enviado'; end if;
  if f.total_avec is null then raise exception 'Informe o TOTAL FATURADO do Avec'; end if;
  if f.data > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Não é possível enviar fechamento de data futura'; end if;

  select coalesce(sum(i.valor), 0) into v_total
  from public.fechamento_itens i
  join public.formas_pagamento fp on fp.id = i.forma_pagamento_id
  where i.fechamento_id = p_id and fp.soma_total_avec;

  if v_total <> f.total_avec and coalesce(trim(f.observacoes), '') = '' then
    raise exception 'Soma das formas (%) difere do total do Avec (%). Corrija ou justifique nas observações.', v_total, f.total_avec;
  end if;

  if f.dinheiro_contado is null then
    raise exception 'Informe o dinheiro contado na gaveta';
  end if;

  select * into e from public.empresas where id = f.empresa_id;

  perform set_config('riro.transicao', 'on', true);

  insert into public.recebiveis (
    empresa_id, fechamento_id, forma_pagamento_id, conta_id, destino, quantidade,
    data_venda, data_prevista, valor_bruto, taxa_percentual
  )
  select
    f.empresa_id, f.id, fp.id,
    case fp.destino
      when 'caixa' then e.conta_caixa_id
      when 'banco' then e.conta_banco_id
      when 'adquirente' then e.conta_adquirente_id
    end,
    fp.destino, i.quantidade, f.data,
    public.calcular_data_prevista(f.data, fp.prazo_dias, fp.dias_uteis),
    i.valor, fp.taxa_percentual
  from public.fechamento_itens i
  join public.formas_pagamento fp on fp.id = i.forma_pagamento_id
  where i.fechamento_id = p_id and fp.gera_recebivel and i.valor > 0;

  update public.fechamentos_caixa
     set status = 'enviado', enviado_por = auth.uid(), enviado_em = now(),
         atualizado_por = auth.uid(), atualizado_em = now()
   where id = p_id;

  perform set_config('riro.transicao', 'off', true);
end;
$$;

-- Enviado → Conferido (financeiro valida os números lançados pela operação)
create or replace function public.conferir_fechamento(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_status public.status_fechamento;
begin
  if not public.tem_papel('financeiro', 'admin') then
    raise exception 'Somente o financeiro pode conferir fechamentos';
  end if;
  select status into v_status from public.fechamentos_caixa where id = p_id for update;
  if v_status is distinct from 'enviado' then
    raise exception 'Somente fechamentos enviados podem ser conferidos';
  end if;

  perform set_config('riro.transicao', 'on', true);
  update public.fechamentos_caixa
     set status = 'conferido', conferido_por = auth.uid(), conferido_em = now(),
         atualizado_por = auth.uid(), atualizado_em = now()
   where id = p_id;
  perform set_config('riro.transicao', 'off', true);
end;
$$;

-- Enviado/Conferido → Rascunho. Remove os recebíveis ainda não conciliados.
create or replace function public.reabrir_fechamento(p_id uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_status public.status_fechamento;
begin
  if not public.tem_papel('financeiro', 'admin') then
    raise exception 'Somente o financeiro pode reabrir fechamentos';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da reabertura';
  end if;
  select status into v_status from public.fechamentos_caixa where id = p_id for update;
  if v_status is null then raise exception 'Fechamento não encontrado'; end if;
  if v_status = 'rascunho' then raise exception 'Fechamento já está em rascunho'; end if;
  if exists (select 1 from public.recebiveis where fechamento_id = p_id and status <> 'previsto') then
    raise exception 'Há recebíveis já conciliados neste fechamento; desfaça a conciliação antes de reabrir';
  end if;

  perform set_config('riro.transicao', 'on', true);
  delete from public.recebiveis where fechamento_id = p_id;
  update public.fechamentos_caixa
     set status = 'rascunho', enviado_por = null, enviado_em = null,
         conferido_por = null, conferido_em = null,
         atualizado_por = auth.uid(), atualizado_em = now()
   where id = p_id;
  insert into public.auditoria (tabela, registro_id, acao, usuario_id, motivo)
  values ('fechamentos_caixa', p_id, 'REABERTURA', auth.uid(), p_motivo);
  perform set_config('riro.transicao', 'off', true);
end;
$$;

-- Recebíveis só nascem/morrem pelas funções acima
create or replace function public.proteger_recebiveis()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.em_transicao() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op in ('INSERT', 'DELETE') then
    raise exception 'Recebíveis são gerados apenas pelo fechamento de caixa';
  end if;
  if new.valor_bruto <> old.valor_bruto or new.fechamento_id <> old.fechamento_id
     or new.forma_pagamento_id <> old.forma_pagamento_id or new.data_venda <> old.data_venda
     or new.empresa_id <> old.empresa_id then
    raise exception 'Origem do recebível não pode ser alterada';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger proteger_recebiveis
  before insert or update or delete on public.recebiveis
  for each row execute function public.proteger_recebiveis();

-- ─────────────────────────────────────────────────────────────
-- Auditoria genérica
-- ─────────────────────────────────────────────────────────────
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.auditoria (tabela, registro_id, acao, usuario_id, dados_antes, dados_depois)
  values (
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'empresas', 'contas_financeiras', 'adquirentes', 'formas_pagamento', 'plano_contas',
    'perfis', 'fechamentos_caixa', 'fechamento_itens', 'movimentos_caixa', 'recebiveis'
  ] loop
    execute format(
      'create trigger auditoria after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.empresas           enable row level security;
alter table public.contas_financeiras enable row level security;
alter table public.adquirentes        enable row level security;
alter table public.formas_pagamento   enable row level security;
alter table public.plano_contas       enable row level security;
alter table public.perfis             enable row level security;
alter table public.fechamentos_caixa  enable row level security;
alter table public.fechamento_itens   enable row level security;
alter table public.movimentos_caixa   enable row level security;
alter table public.recebiveis         enable row level security;
alter table public.auditoria          enable row level security;

-- Cadastros: leitura para qualquer usuário ativo; escrita para financeiro/admin
do $$
declare t text;
begin
  foreach t in array array['empresas', 'contas_financeiras', 'adquirentes', 'formas_pagamento', 'plano_contas'] loop
    execute format('create policy leitura on public.%I for select to authenticated using (public.papel_atual() is not null)', t);
    execute format('create policy insercao on public.%I for insert to authenticated with check (public.tem_papel(''financeiro'', ''admin''))', t);
    execute format('create policy edicao on public.%I for update to authenticated using (public.tem_papel(''financeiro'', ''admin'')) with check (public.tem_papel(''financeiro'', ''admin''))', t);
  end loop;
end $$;

-- Perfis: cada um vê o próprio; gerência vê todos; somente admin altera
create policy leitura on public.perfis for select to authenticated
  using (id = auth.uid() or public.tem_papel('gerente', 'financeiro', 'admin'));
create policy edicao on public.perfis for update to authenticated
  using (public.tem_papel('admin')) with check (public.tem_papel('admin'));

-- Fechamentos: qualquer usuário ativo lança; as regras de status ficam nos triggers
create policy leitura on public.fechamentos_caixa for select to authenticated
  using (public.papel_atual() is not null);
create policy insercao on public.fechamentos_caixa for insert to authenticated
  with check (public.papel_atual() is not null);
create policy edicao on public.fechamentos_caixa for update to authenticated
  using (public.papel_atual() is not null) with check (public.papel_atual() is not null);
create policy exclusao on public.fechamentos_caixa for delete to authenticated
  using (criado_por = auth.uid() or public.tem_papel('gerente', 'financeiro', 'admin'));

do $$
declare t text;
begin
  foreach t in array array['fechamento_itens', 'movimentos_caixa'] loop
    execute format('create policy leitura on public.%I for select to authenticated using (public.papel_atual() is not null)', t);
    execute format('create policy insercao on public.%I for insert to authenticated with check (public.papel_atual() is not null)', t);
    execute format('create policy edicao on public.%I for update to authenticated using (public.papel_atual() is not null) with check (public.papel_atual() is not null)', t);
    execute format('create policy exclusao on public.%I for delete to authenticated using (public.papel_atual() is not null)', t);
  end loop;
end $$;

-- Recebíveis: operação não enxerga; financeiro concilia
create policy leitura on public.recebiveis for select to authenticated
  using (public.tem_papel('gerente', 'financeiro', 'admin'));
create policy edicao on public.recebiveis for update to authenticated
  using (public.tem_papel('financeiro', 'admin')) with check (public.tem_papel('financeiro', 'admin'));

create policy leitura on public.auditoria for select to authenticated
  using (public.tem_papel('admin'));
-- o motivo de uma reabertura fica visível para quem vê o fechamento
create policy leitura_reabertura on public.auditoria for select to authenticated
  using (acao = 'REABERTURA' and public.papel_atual() is not null);

-- Funções expostas via RPC
revoke execute on function public.enviar_fechamento(uuid) from public, anon;
revoke execute on function public.conferir_fechamento(uuid) from public, anon;
revoke execute on function public.reabrir_fechamento(uuid, text) from public, anon;
grant execute on function public.enviar_fechamento(uuid) to authenticated;
grant execute on function public.conferir_fechamento(uuid) to authenticated;
grant execute on function public.reabrir_fechamento(uuid, text) to authenticated;
