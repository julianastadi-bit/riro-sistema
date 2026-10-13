import { createClient } from "@supabase/supabase-js";
const a = createClient(process.env.SUPABASE_URL || "http://127.0.0.1:64321", process.env.SR, { auth: { persistSession: false } });
for (const [nome, email, papel] of [["Juliana Stadi","admin@riro.test","admin"],["Carol","carol@riro.test","operacao"],["Financeiro","fin@riro.test","financeiro"]]) {
  const { data, error } = await a.auth.admin.createUser({ email, password: "riro12345", email_confirm: true, user_metadata: { nome } });
  if (error) { console.log(email, error.message); continue; }
  const r = await a.from("perfis").update({ papel }).eq("id", data.user.id);
  console.log(email, papel, r.error?.message ?? "ok");
}
