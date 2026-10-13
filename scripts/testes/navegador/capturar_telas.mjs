import { chromium } from "playwright";
const B = "http://localhost:3000", OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function ctx(email, mobile) {
  const c = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  p.on("dialog", (d) => d.dismiss());
  if (email) {
    await p.goto(B + "/login");
    await p.fill('input[name="email"]', email); await p.fill('input[name="senha"]', "riro12345");
    await Promise.all([p.waitForURL(B + "/"), p.click('button[type="submit"]')]);
  }
  return p;
}
// Ajusta a janela à altura do conteúdo para que barras fixas fiquem no lugar certo
async function foto(p, nome, { inteira = true } = {}) {
  await p.waitForLoadState("networkidle");
  const w = p.viewportSize().width, base = p.viewportSize().height;
  if (inteira) {
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.setViewportSize({ width: w, height: Math.max(h, base) });
  }
  await p.screenshot({ path: `${OUT}/${nome}.jpg`, type: "jpeg", quality: 82 });
  await p.setViewportSize({ width: w, height: base });
}
const valor = (p, n) => p.locator(`input[aria-label="Quantidade ${n}"]`).locator("xpath=following-sibling::input");

let p = await ctx(null); await p.goto(B + "/login"); await foto(p, "d-login", { inteira: false });
p = await ctx(null, true); await p.goto(B + "/login"); await foto(p, "m-login", { inteira: false });

// Operação
p = await ctx("carol@riro.test");
await foto(p, "d-painel-operacao");
await p.goto(B + "/fechamentos/novo"); await foto(p, "d-novo", { inteira: false });
const lista = await p.goto(B + "/fechamentos?mes=2026-10");
const rasc = await p.locator('a:has-text("Rascunho")').first().getAttribute("href");
await p.goto(B + rasc);
for (const [n, v] of [["Dinheiro","420"],["Crédito MasterCard","21.380"],["Crédito Visa","5.940"],["Crédito Amex","1.200"],["Débito Maestro","1.650"],["Débito Visa","890"],["Pix","3.100"]]) {
  await valor(p, n).fill(v); await valor(p, n).blur();
}
await p.fill("#total-avec", "34.630,00"); await p.locator("#total-avec").blur();
await p.getByText("Adicionar").click();
await p.locator("select").last().selectOption("sangria");
await p.locator('input[placeholder="0,00"]').last().fill("80"); await p.locator('input[placeholder="0,00"]').last().blur();
await p.fill('input[placeholder^="Descrição"]', "Motoboy entrega de produtos");
await p.fill("#contado", "340"); await p.locator("#contado").blur();
await foto(p, "d-fechamento-rascunho");

// Financeiro
p = await ctx("fin@riro.test");
await foto(p, "d-painel-financeiro");
await p.goto(B + "/fechamentos?mes=2026-10"); await foto(p, "d-lista");
const env = await p.locator('a:has-text("Enviado")').first().getAttribute("href");
await p.goto(B + env); await foto(p, "d-fechamento-enviado");
await p.goto(B + "/recebiveis?de=2026-10-01&ate=2026-11-30"); await foto(p, "d-recebiveis");
for (const aba of ["formas", "empresas", "contas", "plano"]) { await p.goto(B + "/cadastros?aba=" + aba); await foto(p, "d-cadastros-" + aba); }
await p.goto(B + "/cadastros?aba=formas");
await p.locator("summary").filter({ hasText: "Crédito MasterCard" }).click();
await foto(p, "d-cadastros-editar-taxa");

// Admin
p = await ctx("admin@riro.test");
await p.goto(B + "/usuarios"); await foto(p, "d-usuarios");

// Celular
p = await ctx("carol@riro.test", true);
await foto(p, "m-painel-operacao");
await p.goto(B + rasc); await foto(p, "m-fechamento");
await p.getByLabel("Abrir menu").click(); await foto(p, "m-menu", { inteira: false });
p = await ctx("fin@riro.test", true);
await p.goto(B + "/recebiveis?de=2026-10-01&ate=2026-11-30"); await foto(p, "m-recebiveis");
await p.goto(B + "/fechamentos?mes=2026-10"); await foto(p, "m-lista");
await browser.close();
