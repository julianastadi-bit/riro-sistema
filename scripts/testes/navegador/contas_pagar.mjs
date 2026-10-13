import { chromium } from "playwright";
const B = "http://localhost:3000", OUT = process.argv[2], PLAN = process.argv[3];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const log = (...a) => console.log("•", ...a);
async function entrar(email, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  const p = await c.newPage();
  p.on("pageerror", (e) => console.log("ERRO PÁGINA:", e.message));
  await p.goto(B + "/login");
  await p.fill('input[name="email"]', email); await p.fill('input[name="senha"]', "riro12345");
  await Promise.all([p.waitForURL(B + "/"), p.click('button[type="submit"]')]);
  return p;
}
async function foto(p, nome, inteira = true) {
  await p.waitForLoadState("networkidle");
  const { width, height } = p.viewportSize();
  if (inteira) await p.setViewportSize({ width, height: Math.max(height, await p.evaluate(() => document.documentElement.scrollHeight)) });
  await p.screenshot({ path: `${OUT}/${nome}.jpg`, type: "jpeg", quality: 82 });
  await p.setViewportSize({ width, height });
}

// Operação não acessa
let p = await entrar("carol@riro.test");
await p.goto(B + "/pagar"); log("operação em /pagar →", p.url());
log("menu mostra contas a pagar p/ operação:", await p.getByText("Contas a pagar").count());

// Financeiro: importação
p = await entrar("fin@riro.test");
await p.goto(B + "/pagar/importar");
await p.setInputFiles('input[name="planilha"]', PLAN);
await p.getByRole("button", { name: "Analisar" }).click();
await p.getByText("Por categoria").waitFor({ timeout: 60000 });
log("prévia:", (await p.locator("p.num").allInnerTexts()).join(" | "));
await foto(p, "01-importar-previa");
await p.getByRole("button", { name: /Importar \d+ lançamentos/ }).click();
await p.getByText("Importação concluída").waitFor({ timeout: 60000 });
log("resultado:", (await p.locator("ul.space-y-1").innerText()).replace(/\n/g, " / "));
await foto(p, "02-importar-resultado");
// reimportar
await p.goto(B + "/pagar/importar");
await p.setInputFiles('input[name="planilha"]', PLAN);
await p.getByRole("button", { name: "Analisar" }).click();
await p.getByText("Nada novo para importar").waitFor({ timeout: 60000 }); log("reanálise: nada novo para importar");

// Lista
await p.goto(B + "/pagar");
await foto(p, "03-lista-abertas");
log("indicadores:", (await p.locator(".num.mt-2").allInnerTexts()).join(" | "));
// pagamento em lote: 2 primeiras abertas
const boxes = p.locator('li input[type="checkbox"]');
await boxes.nth(0).check(); await boxes.nth(1).check();
await p.locator("select").last().selectOption({ label: "Santander 1547" });
await foto(p, "04-lista-selecao", false);
await p.getByRole("button", { name: "Registrar pagamento" }).click();
await p.getByText("2 pagamentos registrados.").waitFor(); log("lote pago");

// Nova conta parcelada
await p.goto(B + "/pagar/nova");
await p.fill('input[name="fornecedor"]', "Studio Luz Iluminação");
await p.fill('input[name="descricao"]', "Troca da iluminação do lavatório");
await p.selectOption('select[name="plano_conta_id"]', { label: "5.01 · Compra de ativo imobilizado" });
await p.fill('input[name="valor"]', "10.000"); await p.locator('input[name="valor"]').blur();
await p.fill('input[name="data_vencimento"]', "2026-10-20");
await p.getByRole("button", { name: "Parcelada" }).click();
await p.fill('input[name="vezes"]', "3");
await foto(p, "05-nova-parcelada");
await Promise.all([p.waitForURL(/criadas=3/), p.getByRole("button", { name: "Lançar 3 contas" }).click()]);
log("parcelada criada");
// abre parcela
await p.goto(B + "/pagar?busca=Studio&ate=2027-01-31");
await p.getByText("Studio Luz Iluminação").first().click();
await p.waitForURL(/pagar\/[0-9a-f-]{36}/);
log("parcelas no grupo:", await p.locator("text=/\\dª/").count());
await p.locator("select:visible").first().selectOption({ label: "Safra (Safrapay)" });
await p.locator("input[placeholder=\"0,00\"]:visible").first().fill("15,50");
await p.getByRole("button", { name: "Confirmar pagamento" }).click();
await p.getByText("Pagamento registrado.").waitFor(); log("pago c/ juros");
await foto(p, "06-detalhe-paga");
await p.getByRole("button", { name: "Estornar pagamento" }).click();
await p.getByPlaceholder("Fica registrado no histórico").fill("Pagamento lançado na conta errada");
await p.getByRole("button", { name: "Confirmar" }).click();
await p.getByText("Pagamento estornado").waitFor(); log("estornado");
await p.reload(); await p.getByText("Pagamento lançado na conta errada").waitFor(); log("histórico visível");
await foto(p, "07-detalhe-estornada");

// Conta da planilha R. Rodrigues paga pelo Santander
await p.goto(B + "/pagar?situacao=pagas&de=2026-09-01&ate=2026-10-31");
log("sinalização outra empresa:", await p.getByText("conta de outra empresa").count());
await foto(p, "08-lista-pagas");

await p.goto(B + "/cadastros?aba=fornecedores");
await foto(p, "09-fornecedores");
await p.goto(B + "/"); await foto(p, "10-painel");

// Celular
const m = await entrar("fin@riro.test", true);
await m.goto(B + "/pagar"); await foto(m, "11-celular-lista");
await m.locator('li input[type="checkbox"]').first().check(); await foto(m, "12-celular-selecao", false);
log("largura celular:", await m.evaluate(() => document.documentElement.scrollWidth));
await browser.close();
