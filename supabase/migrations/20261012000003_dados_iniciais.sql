-- RIRO · Sistema financeiro
-- 0003 · Dados iniciais (empresas, contas, adquirente, formas de pagamento, plano de contas)
-- Taxas e prazos da Safrapay estão PROVISÓRIOS (valores usados na planilha) até confirmação.

do $$
declare
  v_juliana uuid;
  v_rodrigues uuid;
  v_safrapay uuid;
  v_santander uuid;
  v_safra uuid;
  v_caixa_j uuid;
  v_caixa_r uuid;
begin
  insert into public.empresas (nome, razao_social, principal)
  values ('Juliana S.S. Silva', 'JULIANA S.S.SILVA', true) returning id into v_juliana;
  insert into public.empresas (nome, razao_social, principal)
  values ('R. Rodrigues', 'R.RODRIGUES', false) returning id into v_rodrigues;

  insert into public.contas_financeiras (empresa_id, nome, tipo, banco, numero)
  values (v_juliana, 'Santander 1547', 'banco', 'Santander', '1547') returning id into v_santander;
  insert into public.contas_financeiras (empresa_id, nome, tipo, banco)
  values (v_juliana, 'Safra (Safrapay)', 'banco', 'Safra') returning id into v_safra;
  insert into public.contas_financeiras (empresa_id, nome, tipo)
  values (v_juliana, 'Caixa físico', 'caixa') returning id into v_caixa_j;
  insert into public.contas_financeiras (empresa_id, nome, tipo)
  values (v_rodrigues, 'Caixa físico', 'caixa') returning id into v_caixa_r;

  update public.empresas
     set conta_caixa_id = v_caixa_j, conta_banco_id = v_santander, conta_adquirente_id = v_safra
   where id = v_juliana;
  update public.empresas set conta_caixa_id = v_caixa_r where id = v_rodrigues;

  insert into public.adquirentes (nome) values ('Safrapay') returning id into v_safrapay;

  insert into public.formas_pagamento
    (codigo, nome, grupo, bandeira, adquirente_id, ordem, soma_total_avec, gera_recebivel, receita_dre, destino, prazo_dias, dias_uteis, taxa_percentual)
  values
    -- Compõem o TOTAL FATURADO do Avec
    ('DINHEIRO',         'Dinheiro',            'dinheiro',      null,         null,       10, true,  true,  true,  'caixa',      0, false, 0),
    ('CREDITO_AMEX',     'Crédito Amex',        'credito',       'Amex',       v_safrapay, 20, true,  true,  true,  'adquirente', 1, true,  2.00),
    ('CREDITO_ELO',      'Crédito Elo',         'credito',       'Elo',        v_safrapay, 21, true,  true,  true,  'adquirente', 1, true,  2.00),
    ('CREDITO_HIPERCARD','Crédito Hipercard',   'credito',       'Hipercard',  v_safrapay, 22, true,  true,  true,  'adquirente', 1, true,  2.00),
    ('CREDITO_MASTER',   'Crédito MasterCard',  'credito',       'MasterCard', v_safrapay, 23, true,  true,  true,  'adquirente', 1, true,  2.00),
    ('CREDITO_VISA',     'Crédito Visa',        'credito',       'Visa',       v_safrapay, 24, true,  true,  true,  'adquirente', 1, true,  2.00),
    ('DEBITO_ELO',       'Débito Elo',          'debito',        'Elo',        v_safrapay, 30, true,  true,  true,  'adquirente', 1, true,  0.91),
    ('DEBITO_MAESTRO',   'Débito Maestro',      'debito',        'Maestro',    v_safrapay, 31, true,  true,  true,  'adquirente', 1, true,  0.91),
    ('DEBITO_VISA',      'Débito Visa',         'debito',        'Visa',       v_safrapay, 32, true,  true,  true,  'adquirente', 1, true,  0.91),
    ('CHEQUE',           'Cheque',              'cheque',        null,         null,       40, true,  true,  true,  'banco',      1, true,  0),
    ('BOLETO',           'Boleto',              'boleto',        null,         null,       41, true,  true,  true,  'banco',      1, true,  0),
    ('TRANSFERENCIA',    'Transferência',       'transferencia', null,         null,       42, true,  true,  true,  'banco',      0, false, 0),
    ('PIX',              'Pix',                 'pix',           null,         null,       43, true,  true,  true,  'banco',      0, false, 0),
    ('GIFT_CARD',        'Gift Card',           'gift_card',     null,         null,       44, true,  false, false, null,         0, false, 0),
    -- Abaixo do TOTAL FATURADO: não entram no caixa do dia
    ('VOUCHER',          'Voucher',             'voucher',       null,         null,       50, false, false, false, null,         0, false, 0),
    ('PERMUTA',          'Permuta',             'permuta',       null,         null,       51, false, false, true,  null,         0, false, 0),
    ('CORTESIA',         'Cortesia',            'cortesia',      null,         null,       52, false, false, false, null,         0, false, 0),
    ('CREDITO_UTILIZADO','Crédito utilizado',   'credito_utilizado', null,     null,       53, false, false, false, null,         0, false, 0),
    ('DIVIDA',           'Dívidas (fiado)',     'divida',        null,         null,       54, false, true,  true,  'cliente',   30, false, 0);

  -- Formas sem taxa não dependem de confirmação
  update public.formas_pagamento set taxa_confirmada = true where adquirente_id is null;

  -- Plano de contas (estrutura da DRE da planilha FLUXO RIRO SALON)
  insert into public.plano_contas (codigo, nome, grupo, tipo, ordem, descricao) values
    ('1.01', 'Receita de serviços',           'Receita Bruta',          'receita',      101, 'Faturamento de serviços do Avec'),
    ('1.02', 'Venda de produtos',             'Receita Bruta',          'receita',      102, 'Revenda de produtos'),
    ('1.03', 'Permutas',                      'Receita Bruta',          'receita',      103, 'Serviços pagos com permuta'),
    ('1.04', 'Verbas de retorno (fornecedores)', 'Outras Receitas',     'receita',      104, 'Wella, L''Oréal, Boticário etc.'),
    ('2.01', 'Taxa administrativa de cartões','Deduções',               'deducao',      201, 'Taxas da adquirente'),
    ('2.02', 'Impostos sobre faturamento',    'Deduções',               'deducao',      202, 'ISS, Simples, DAS'),
    ('3.01', 'Custo de mercadoria',           'Custo Mercadoria',       'custo',        301, 'Fornecedor cujo produto é revendido'),
    ('4.01', 'Despesas de pessoal',           'Despesas de Pessoal',    'despesa',      401, 'Folha, encargos, FGTS, INSS, comissões, benefícios'),
    ('4.02', 'Despesas de capacitação',       'Despesas Capacitação',   'despesa',      402, 'Cursos e treinamentos'),
    ('4.03', 'Despesas de ocupação',          'Despesas de Ocupação',   'despesa',      403, 'Aluguel + IPTU'),
    ('4.04', 'Despesas de manutenção',        'Despesas Manutenção',    'despesa',      404, 'Manutenção predial, pintura, reparos'),
    ('4.05', 'Despesas de funcionamento',     'Despesas Funcionamento', 'despesa',      405, 'Água, energia, internet, alarme, sistemas'),
    ('4.06', 'Marketing',                     'Marketing',              'despesa',      406, 'Anúncios, agência, brindes'),
    ('4.07', 'Materiais de consumo',          'Materiais de Consumo',   'despesa',      407, 'Limpeza, alimentação, produtos de uso interno'),
    ('5.01', 'Compra de ativo imobilizado',   'Imobilizado',            'investimento', 501, 'Móveis, equipamentos, reformas'),
    ('6.01', 'Pró-labore',                    'Prolabore',              'participacao', 601, 'Retiradas dos sócios'),
    ('7.01', 'Processos e empréstimos',       'Processo/Empréstimo',    'financeiro',   701, 'Processos judiciais e parcelas de empréstimos');
end $$;
