import { chromium } from "playwright";
const B = "http://localhost:3000", OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const log = (...a) => console.log("•", ...a);

async function entrar(ctx, email) {
  const p = await ctx.newPage();
  p.on("dialog", (d) => (d.type() === "prompt" ? d.accept("Ajuste de teste") : d.accept()));
  p.on("pageerror", (e) => console.log("ERRO PÁGINA:", e.message));
  await p.goto(B + "/login");
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="senha"]', "riro12345");
  await Promise.all([p.waitForURL(B + "/"), p.click('button[type="submit"]')]);
  return p;
}
const valor = (p, nome) => p.locator(`input[aria-label="Quantidade ${nome}"]`).locator("xpath=following-sibling::input");
const qtd = (p, nome) => p.locator(`input[aria-label="Quantidade ${nome}"]`);

// ── Operação ──
const op = await browser.newContext({ viewport: { width: 1360, height: 900 } });
let p = await entrar(op, "carol@riro.test");
await p.screenshot({ path: `${OUT}/01-painel-operacao.png`, fullPage: true });
await p.goto(B + "/recebiveis"); log("operação em /recebiveis →", p.url());
await p.goto(B + "/fechamentos/novo?data=2026-10-09");
await Promise.all([p.waitForURL(/fechamentos\/[0-9a-f-]{36}/), p.click('button[type="submit"]')]);
const urlF = p.url(); log("fechamento criado", urlF);
const dados = [["Dinheiro",1,"147"],["Crédito Amex",1,"1804"],["Crédito MasterCard",33,"46.728,00"],["Crédito Visa",11,"6479"],
  ["Débito Maestro",3,"2805"],["Débito Visa",2,"1230"],["Pix",0,"2660"],["Permuta",0,"2550"],["Crédito utilizado",0,"10"],["Dívidas (fiado)",0,"1530"]];
for (const [n,q,v] of dados) { if (q) await qtd(p,n).fill(String(q)); await valor(p,n).fill(v); await valor(p,n).blur(); }
await p.fill("#total-avec", "61.853,00"); await p.locator("#total-avec").blur();
await p.fill("#contado", "147"); await p.locator("#contado").blur();
await p.getByRole("button", { name: "Salvar" }).click();
await p.getByText("Rascunho salvo.").waitFor(); log("rascunho salvo");
await p.screenshot({ path: `${OUT}/02-fechamento-rascunho.png`, fullPage: true });
await p.getByRole("button", { name: "Enviar fechamento" }).click();
await p.getByText("Fechamento enviado").waitFor(); log("enviado");
await p.screenshot({ path: `${OUT}/03-fechamento-enviado.png`, fullPage: true });

// operação tenta reenviar alterado? os inputs ficam desabilitados
log("inputs desabilitados após envio:", await valor(p,"Pix").isDisabled());

// ── Financeiro ──
const fin = await browser.newContext({ viewport: { width: 1360, height: 900 } });
p = await entrar(fin, "fin@riro.test");
await p.screenshot({ path: `${OUT}/04-painel-financeiro.png`, fullPage: true });
await p.goto(B + "/recebiveis?de=2026-10-01&ate=2026-11-30");
await p.screenshot({ path: `${OUT}/05-recebiveis.png`, fullPage: true });
log("linhas recebíveis:", await p.locator("tbody tr").count());
await p.goto(urlF);
await p.getByRole("button", { name: "Marcar como conferido" }).click();
await p.getByText("Fechamento conferido.").waitFor(); log("conferido");
await p.getByRole("button", { name: "Reabrir" }).click();
await p.getByText("reaberto").waitFor(); log("reaberto, status rascunho:", await p.getByText("Rascunho").first().isVisible());
await p.getByText("Ajuste de teste").waitFor(); log("motivo de reabertura visível");
await valor(p,"Pix").fill("2.600,00"); await valor(p,"Pix").blur();
await p.getByRole("button", { name: "Enviar fechamento" }).click();
await p.getByText(/difere do total do Avec/).waitFor(); log("bloqueou diferença sem justificativa");
await p.screenshot({ path: `${OUT}/06-diferenca-bloqueada.png`, fullPage: true });
await p.fill("textarea", "Pix de R$ 60 estornado no banco; cliente pagou em dinheiro");
await p.getByRole("button", { name: "Enviar fechamento" }).click();
await p.getByText("Fechamento enviado").waitFor(); log("reenviado com justificativa");
await p.goto(B + "/fechamentos?mes=2026-10");
await p.screenshot({ path: `${OUT}/07-lista-fechamentos.png`, fullPage: true });
await p.goto(B + "/cadastros");
await p.screenshot({ path: `${OUT}/08-cadastros-formas.png`, fullPage: true });

// ── Admin ──
const adm = await browser.newContext({ viewport: { width: 1360, height: 900 } });
p = await entrar(adm, "admin@riro.test");
await p.goto(B + "/usuarios");
await p.screenshot({ path: `${OUT}/09-usuarios.png`, fullPage: true });

// ── Celular ──
const cel = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p = await entrar(cel, "carol@riro.test");
await p.screenshot({ path: `${OUT}/10-celular-painel.png` });
await p.goto(B + "/fechamentos/novo?data=2026-10-10");
await Promise.all([p.waitForURL(/fechamentos\/[0-9a-f-]{36}/), p.click('button[type="submit"]')]);
await valor(p,"Dinheiro").fill("320"); await valor(p,"Crédito Visa").fill("1250"); await p.fill("#total-avec","1570");
await p.locator("#total-avec").blur();
await p.screenshot({ path: `${OUT}/11-celular-fechamento.png`, fullPage: true });
const larg = await p.evaluate(() => document.documentElement.scrollWidth);
log("largura do documento no celular:", larg);
await p.getByLabel("Abrir menu").click();
await p.screenshot({ path: `${OUT}/12-celular-menu.png` });
const lg = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const pl = await lg.newPage(); await pl.goto(B + "/login"); await pl.screenshot({ path: `${OUT}/00-login-celular.png` });
await browser.close();
