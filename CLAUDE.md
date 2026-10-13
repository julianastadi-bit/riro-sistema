# RIRO · Sistema Financeiro

Sistema financeiro do RIRO Salon (salão de alto padrão, duas empresas). **Leia `docs/PASSAGEM.md` antes de qualquer mudança**: contexto do negócio, decisões, modelo de dados, regras, design e pendências.

## Convenções
- Código, nomes de tabelas, colunas, funções e textos da interface **em português** (sem acentos em identificadores).
- Regras de negócio ficam **no banco** (triggers `proteger_*`, funções `security definer`, RLS). Mudança de status só por função que liga `set_config('riro.transicao','on',true)`. Nunca relaxe isso na interface.
- Toda tabela nova: RLS ligada, policies por `tem_papel(...)`, trigger `auditoria`. Ações sensíveis exigem motivo.
- Migrações novas em `supabase/migrations/AAAAMMDDHHMMSS_nome.sql`; nunca edite uma migração já aplicada em produção.
- Server Actions usam `criarClienteServidor()` (sessão do usuário). `criarClienteAdmin()` (service role) só para gestão de usuários.
- Valores em dinheiro: `lerValor` para entrada (padrão BR), `somar` (centavos) para totais, `formatarMoeda`/`formatarNumero` para exibir. Datas ISO `AAAA-MM-DD` sem fuso; "hoje" é `hojeSP()`.
- UI: componentes de `src/components/ui.tsx` e tokens de `globals.css` (cobre, creme, grafite, linha). Fonte Jost, números com `.num`. Testar em 390 px de largura.

## Comandos
- `npm run dev` · `npm run typecheck` · `npm run build`
- Supabase local: `npx supabase start` (aplica as migrações)
- Testes: ver `scripts/testes/README.md`
