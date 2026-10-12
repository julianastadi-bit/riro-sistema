import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

async function sair(request: NextRequest) {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  const url = new URL("/login", request.url);
  const erro = request.nextUrl.searchParams.get("erro");
  if (erro) url.searchParams.set("erro", erro);
  return NextResponse.redirect(url, { status: 303 });
}

export const GET = sair;
export const POST = sair;
