# Testes e dados de demonstração

Scripts usados para validar as fases 1 e 2. Rodam contra um **Supabase local** (`npx supabase start`) e o app em `http://localhost:3000`.

> As portas locais usadas nos testes foram 643xx (API `64321`, banco `64322`). O `supabase/config.toml` versionado usa as portas padrão (543xx): ajuste os comandos conforme o seu ambiente.

## 1. Usuários de teste
```bash
SR=<SERVICE_ROLE_KEY local> SUPABASE_URL=http://127.0.0.1:54321 node scripts/testes/criar_usuarios_teste.mjs
```
Cria `admin@riro.test` (admin), `carol@riro.test` (operação) e `fin@riro.test` (financeiro), todos com a senha `riro12345`. **Nunca rode em produção.**

## 2. Testes de regras no banco (SQL)
| Arquivo | O que valida |
|---|---|
| `sql/00_stub_auth_postgres_puro.sql` | Só para Postgres puro (sem Supabase): cria `auth.users`, `auth.uid()` e os papéis `anon`/`authenticated`. |
| `sql/10_fechamento_regras.sql` | Fechamento real de 09/10 (R$ 61.853): envio, geração dos 8 recebíveis, bloqueios da operação, conferência, reabertura com motivo, diferença sem justificativa. Escrito para o Postgres puro com o stub. |
| `sql/20_contas_pagar_regras.sql` | Contas a pagar: RLS por perfil, baixa individual/lote, juros, travas, estorno, cancelamento, importação idempotente. Roda no Supabase local (tudo em transação com `rollback`). |
| `sql/90_dados_demonstracao.sql` | Gera fechamentos de exemplo (01–08/10) nas duas empresas. Só para demonstração. |

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f scripts/testes/sql/20_contas_pagar_regras.sql
```

## 3. Testes no navegador (Playwright)
```bash
npm i -D playwright   # ou use um Chromium já instalado com CHROMIUM_PATH
node scripts/testes/navegador/fechamento.mjs <pasta-de-capturas>
node scripts/testes/navegador/contas_pagar.mjs <pasta-de-capturas> <caminho-da-planilha.xlsm>
node scripts/testes/navegador/capturar_telas.mjs <pasta-de-capturas>
```
`contas_pagar.mjs` precisa da planilha FLUXO RIRO SALON e espera a base sem contas a pagar (limpe antes de repetir).
