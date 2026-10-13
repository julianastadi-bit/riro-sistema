\set ON_ERROR_STOP 0
\set QUIET 1
select id as carol from perfis where email='carol@riro.test' \gset
select id as fin from perfis where email='fin@riro.test' \gset
select id as emp from empresas where principal \gset
select id as plano from plano_contas where codigo='4.05' \gset
select id as conta from contas_financeiras where nome='Santander 1547' \gset
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'carol','role','authenticated')::text, true);
\echo '--- operação tenta ver/criar fornecedor e conta'
select count(*) from contas_pagar;
insert into fornecedores(nome) values ('X');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'fin','role','authenticated')::text, true);
insert into fornecedores(nome, plano_conta_id) values ('ENEL', :'plano') returning id as forn \gset
\echo '--- duplicado de nome (case)'
savepoint a; insert into fornecedores(nome) values ('enel '); rollback to a;
insert into contas_pagar(empresa_id,fornecedor_id,plano_conta_id,descricao,competencia,data_vencimento,valor)
 values (:'emp',:'forn',:'plano','Energia outubro','2026-10-01','2026-10-15',1830.55) returning id as c1 \gset
insert into contas_pagar(empresa_id,fornecedor_id,plano_conta_id,descricao,competencia,data_vencimento,valor)
 values (:'emp',:'forn',:'plano','Energia nov','2026-11-01','2026-11-15',1700) returning id as c2 \gset
\echo '--- inserir já pago (deve falhar)'
savepoint a; insert into contas_pagar(empresa_id,fornecedor_id,plano_conta_id,descricao,competencia,data_vencimento,valor,status) values (:'emp',:'forn',:'plano','x','2026-10-01','2026-10-15',1,'pago'); rollback to a;
\echo '--- mudar status direto (deve falhar)'
savepoint a; update contas_pagar set status='pago' where id=:'c1'; rollback to a;
\echo '--- pagar em lote com juros (deve falhar)'
savepoint a; select pagar_contas(array[:'c1',:'c2']::uuid[], '2026-10-12', :'conta', 5, 0); rollback to a;
\echo '--- pagar data futura (deve falhar)'
savepoint a; select pagar_contas(array[:'c1']::uuid[], '2026-12-12', :'conta'); rollback to a;
\echo '--- pagar c1 com juros 12,30'
select pagar_contas(array[:'c1']::uuid[], '2026-10-12', :'conta', 12.30, 0);
select status, valor, juros_multa, valor_pago, data_pagamento from contas_pagar where id=:'c1';
\echo '--- editar valor de conta paga (deve falhar)'
savepoint a; update contas_pagar set valor=1 where id=:'c1'; rollback to a;
\echo '--- anexar comprovante em conta paga (deve funcionar)'
update contas_pagar set comprovante_path='x/y.pdf' where id=:'c1';
\echo '--- excluir conta paga (deve falhar)'
savepoint a; delete from contas_pagar where id=:'c1'; rollback to a;
\echo '--- estornar sem motivo (falha) / com motivo'
savepoint a; select estornar_pagamento(:'c1',' '); rollback to a;
select estornar_pagamento(:'c1','Boleto pago em duplicidade, banco devolveu');
select status, valor_pago, juros_multa from contas_pagar where id=:'c1';
select cancelar_conta_pagar(:'c2','Fatura substituída');
select status, motivo_cancelamento from contas_pagar where id=:'c2';
select acao, motivo from auditoria where tabela='contas_pagar' and acao in ('ESTORNO','CANCELAMENTO');
\echo '--- importação idempotente'
select importar_contas_pagar('[{"linha":2,"chave":"k1","empresa":"R.RODRIGUES","fornecedor":"Wella Brasil","descricao":"Compra","forma":"boleto","data_lancamento":"2026-09-02","competencia":"2026-10-01","vencimento":"2026-10-05","valor":"4121.61","pago":true,"banco":"SANTANDER","plano_codigo":"4.07"},{"linha":3,"chave":"k2","empresa":"JULIANA S.S.SILVA","fornecedor":"wella brasil","descricao":"x","forma":"recibo","data_lancamento":"2026-09-02","competencia":"2026-10-01","vencimento":"2026-10-05","valor":"10","pago":true,"banco":null,"plano_codigo":"ZZ"}]'::jsonb);
select importar_contas_pagar('[{"linha":2,"chave":"k1","empresa":"R.RODRIGUES","fornecedor":"Wella","descricao":"Compra","forma":"boleto","data_lancamento":"2026-09-02","competencia":"2026-10-01","vencimento":"2026-10-05","valor":"4121.61","pago":true,"banco":"SANTANDER","plano_codigo":"4.07"}]'::jsonb);
select e.nome empresa, c.nome conta_pg, cp.status, p.codigo from contas_pagar cp join empresas e on e.id=cp.empresa_id left join contas_financeiras c on c.id=cp.conta_pagamento_id join plano_contas p on p.id=cp.plano_conta_id where origem='planilha';
rollback;
