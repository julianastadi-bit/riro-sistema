-- RIRO · Sistema financeiro
-- 0005 · R. Rodrigues também recebe por maquininha (Safrapay) e Pix/transferência.
-- Nomes provisórios: ajustar banco/agência/conta em Cadastros → Contas.

do $$
declare
  v_rodrigues uuid;
  v_banco uuid;
  v_adquirente uuid;
begin
  select id into v_rodrigues from public.empresas where razao_social = 'R.RODRIGUES';
  if v_rodrigues is null then
    return;
  end if;

  insert into public.contas_financeiras (empresa_id, nome, tipo)
  values (v_rodrigues, 'Banco R. Rodrigues (a definir)', 'banco')
  on conflict (empresa_id, nome) do nothing
  returning id into v_banco;

  insert into public.contas_financeiras (empresa_id, nome, tipo, banco)
  values (v_rodrigues, 'Safrapay R. Rodrigues', 'banco', 'Safra')
  on conflict (empresa_id, nome) do nothing
  returning id into v_adquirente;

  update public.empresas
     set conta_banco_id = coalesce(conta_banco_id, v_banco),
         conta_adquirente_id = coalesce(conta_adquirente_id, v_adquirente)
   where id = v_rodrigues;
end $$;
