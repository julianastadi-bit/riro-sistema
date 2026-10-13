do $$
declare
  carol uuid := (select id from perfis where email='carol@riro.test');
  fin uuid := (select id from perfis where email='fin@riro.test');
  emp record; d date; f uuid; fator numeric; base numeric; dia int;
  fp record; v numeric; tot numeric;
begin
  perform setseed(0.42);
  for emp in select id, principal from empresas loop
    for dia in 1..8 loop
      d := date '2026-10-01' + (dia-1);
      continue when extract(isodow from d) = 7;               -- domingo fechado
      continue when not emp.principal and extract(isodow from d) = 1;
      perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role','authenticated')::text, true);
      base := case when emp.principal then 28000 + random()*30000 else 3000 + random()*4000 end;
      insert into fechamentos_caixa (empresa_id, data, dinheiro_contado) values (emp.id, d, 0) returning id into f;
      tot := 0;
      for fp in select id, codigo, soma_total_avec from formas_pagamento loop
        fator := case fp.codigo
          when 'CREDITO_MASTER' then .62 when 'CREDITO_VISA' then .14 when 'CREDITO_AMEX' then .04 when 'CREDITO_ELO' then .02
          when 'DEBITO_MAESTRO' then .05 when 'DEBITO_VISA' then .03 when 'PIX' then .07 when 'DINHEIRO' then .01
          when 'PERMUTA' then case when random() < .3 then .04 else 0 end
          when 'DIVIDA' then case when random() < .25 then .02 else 0 end
          else 0 end;
        v := round(base * fator * (0.8 + random()*0.4) / 10) * 10;
        continue when v = 0;
        insert into fechamento_itens (fechamento_id, forma_pagamento_id, quantidade, valor)
        values (f, fp.id, greatest(1, round(v / 1400)), v);
        if fp.soma_total_avec then tot := tot + v; end if;
      end loop;
      update fechamentos_caixa set total_avec = tot,
        dinheiro_contado = (select coalesce(sum(i.valor),0) from fechamento_itens i join formas_pagamento p on p.id=i.forma_pagamento_id where i.fechamento_id=f and p.codigo='DINHEIRO')
      where id = f;
      perform enviar_fechamento(f);
      if d <= date '2026-10-06' then
        perform set_config('request.jwt.claims', json_build_object('sub', fin, 'role','authenticated')::text, true);
        perform conferir_fechamento(f);
      end if;
    end loop;
  end loop;
end $$;
select e.nome, f.status, count(*) from fechamentos_caixa f join empresas e on e.id=f.empresa_id group by 1,2 order by 1,2;
