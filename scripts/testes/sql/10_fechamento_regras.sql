\set ON_ERROR_STOP 0
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','carol@riro','{"nome":"Carol"}'),
 ('00000000-0000-0000-0000-000000000002','fin@riro','{"nome":"Fin"}');
update perfis set papel='financeiro' where email='fin@riro';
select nome,papel from perfis;

-- Operação (Carol)
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
insert into fechamentos_caixa(empresa_id,data,total_avec,dinheiro_contado)
  select id,'2026-10-09',61853,147 from empresas where principal returning id \gset f_
insert into fechamento_itens(fechamento_id,forma_pagamento_id,quantidade,valor)
select :'f_id', id, q, v from formas_pagamento join (values
 ('DINHEIRO',1,147),('CREDITO_AMEX',1,1804),('CREDITO_MASTER',33,46728),('CREDITO_VISA',11,6479),
 ('DEBITO_MAESTRO',3,2805),('DEBITO_VISA',2,1230),('PIX',0,2660),('PERMUTA',0,2550),('CREDITO_UTILIZADO',0,10),('DIVIDA',0,1530)) x(c,q,v) on x.c=codigo;
select 'operacao ve recebiveis:', count(*) from recebiveis;
select 'tentar status direto'; update fechamentos_caixa set status='conferido' where id=:'f_id';
select 'tentar inserir recebivel'; insert into recebiveis(empresa_id,fechamento_id,forma_pagamento_id,destino,data_venda,data_prevista,valor_bruto) select empresa_id,id,(select id from formas_pagamento limit 1),'caixa',data,data,1 from fechamentos_caixa;
select 'operacao edita taxa'; update formas_pagamento set taxa_percentual=0 where codigo='PIX';
select 'linhas afetadas acima devem ser 0';
select enviar_fechamento(:'f_id');
select 'editar apos envio'; update fechamento_itens set valor=1 where fechamento_id=:'f_id';
select 'operacao conferindo'; select conferir_fechamento(:'f_id');

-- Financeiro
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select fp.codigo, r.destino, c.nome conta, r.data_prevista, r.valor_bruto, r.valor_taxa, r.valor_liquido from recebiveis r join formas_pagamento fp on fp.id=r.forma_pagamento_id left join contas_financeiras c on c.id=r.conta_id order by fp.ordem;
select sum(valor_bruto) bruto, sum(valor_liquido) liquido from recebiveis;
select conferir_fechamento(:'f_id');
select status, enviado_por is not null env, conferido_por is not null conf from fechamentos_caixa;
select 'reabrir sem motivo'; select reabrir_fechamento(:'f_id','');
select reabrir_fechamento(:'f_id','teste de reabertura');
select status, (select count(*) from recebiveis) recs from fechamentos_caixa;
update fechamento_itens set valor=100 where forma_pagamento_id=(select id from formas_pagamento where codigo='DINHEIRO');
select 'enviar com diferenca sem obs'; select enviar_fechamento(:'f_id');
reset role;
select acao, tabela, motivo from auditoria where acao='REABERTURA';
select count(*) audits from auditoria;
select calcular_data_prevista('2026-10-09',1,true) sexta_d1, calcular_data_prevista('2026-10-09',2,true) d2;
