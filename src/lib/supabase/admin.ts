import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com service role: ignora RLS. Usar apenas em ações já autorizadas como admin.
export function criarClienteAdmin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
