# RIRO · Sistema Financeiro

Sistema de gestão financeira do RIRO Salon.

- **Fase 1:** fechamento de caixa diário → contas a receber
- **Fase 2:** contas a pagar, fornecedores e importação da aba PAGTO

Stack: Next.js 15 (App Router) · Supabase (Postgres, Auth, Storage, RLS) · Tailwind 4 · deploy na Netlify.

## Fluxo

```
Operação lança o fechamento do Avec ─► Enviar ─► gera Contas a Receber (bruto, taxa, líquido, data prevista)
                                                 │
Financeiro confere ◄──────────────────────────────┘  (reabrir exige motivo e fica auditado)
```

- **Rascunho → Enviado → Conferido.** Só rascunho é editável; as regras estão no banco (triggers), não só na tela.
- Ao enviar, o sistema exige que a soma das formas bata com o **TOTAL FATURADO** do Avec (ou uma justificativa) e que o dinheiro da gaveta seja contado.
- Cada forma de pagamento (Cadastros) define: soma no faturado, gera recebível, receita na DRE, destino (caixa/banco/adquirente/cliente), taxa e prazo.

## Contas a pagar

- Lançamento único, **parcelado** (divide o valor) ou **recorrente** (repete todo mês), com competência para a DRE.
- Baixa individual (com juros/multa e desconto) ou **em lote** pela lista. A conta de saída pode ser de outra empresa: o sistema sinaliza para acerto entre empresas.
- Conta paga fica travada; **estorno** e **cancelamento** exigem motivo e ficam no histórico.
- Anexos privados de boleto e comprovante (bucket `contas-pagar`).
- **Importar planilha** (`/pagar/importar`): lê a aba PAGTO do FLUXO RIRO SALON. Linhas com OK entram pagas na conta do banco indicado; o campo NUMERO vira parcela (`02/03`), competência (`08/2026`) ou nº do documento. Reimportar não duplica.

## Perfis

| Perfil | Acesso |
|---|---|
| Operação | Lança e envia fechamentos |
| Gerência | + vê contas a receber, contas a pagar e valores |
| Financeiro | + confere, reabre, lança e paga contas, importa planilha, edita cadastros |
| Administrador | + gerencia usuários |

## Implantação

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com) (região São Paulo).
2. Rode as migrações de `supabase/migrations/` **em ordem**: pelo *SQL Editor* (cole cada arquivo) ou via CLI:
   ```bash
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push
   ```
3. Em *Authentication → Providers → Email*, desative "Allow new users to sign up" (os acessos são criados pelo admin).
4. Crie o primeiro usuário em *Authentication → Users → Add user* e promova-o a admin no SQL Editor:
   ```sql
   update perfis set papel = 'admin', nome = 'Seu Nome' where email = 'seu@email.com';
   ```

### 2. Netlify
1. *Add new site → Import from Git* → este repositório (o `netlify.toml` já configura o build).
2. Em *Site configuration → Environment variables*:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (secreta; usada só no servidor para criar usuários)

### Desenvolvimento local
```bash
cp .env.example .env.local   # preencha com as chaves
npm install
npm run dev
```
Com Docker, `npx supabase start` sobe um Supabase local já com as migrações.

## Próximas fases
1. Conciliação: extrato Safrapay, OFX Santander/Safra, contagem de cofre
2. Fluxo de caixa (realizado + projetado) e DRE
3. Integração com o Avec e módulo de CRM
