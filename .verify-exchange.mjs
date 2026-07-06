import { chromium } from "@playwright/test";

const BASE = "http://localhost:3001";
const SHOTS = "/tmp/claude-1000/shots";
const step = (name) => console.log(`\n=== ${name}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

step("login");
await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', "verify@example.com");
await page.fill('input[name="password"]', "verify-password-123");
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }),
  page.click('button[type="submit"]')
]);
console.log("after login url:", page.url());

step("settings page");
await page.goto(`${BASE}/settings`);
await page.screenshot({ path: `${SHOTS}/1-settings-before.png`, fullPage: true });
const exchangeForm = page.locator("form", { has: page.locator('button:has-text("Подключить Exchange")') });
console.log("exchange form visible:", await exchangeForm.isVisible());

step("probe: wrong password first");
await exchangeForm.locator('input[name="serverUrl"]').fill("http://127.0.0.1:8089");
await exchangeForm.locator('input[name="username"]').fill("verifier@corp.example");
await exchangeForm.locator('input[name="password"]').fill("WRONG-password");
await exchangeForm.locator('button[type="submit"]').click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/2-wrong-password.png`, fullPage: true });
console.log("url after wrong password:", page.url());
console.log("page shows error?:", await page.locator("body").innerText().then((t) => t.slice(0, 400)));

step("connect with correct credentials");
await page.goto(`${BASE}/settings`);
const form2 = page.locator("form", { has: page.locator('button:has-text("Подключить Exchange")') });
await form2.locator('input[name="serverUrl"]').fill("http://127.0.0.1:8089");
await form2.locator('input[name="username"]').fill("verifier@corp.example");
await form2.locator('input[name="password"]').fill("ews-secret-123");
await form2.locator('button[type="submit"]').click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SHOTS}/3-connected.png`, fullPage: true });
const sourceText = await page.locator(".calendar-source").allInnerTexts();
console.log("calendar sources:", JSON.stringify(sourceText, null, 1));

step("calendar page shows events");
await page.goto(`${BASE}/calendar`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/4-calendar.png`, fullPage: true });
const bodyText = await page.locator("body").innerText();
for (const needle of ["Планёрка с командой", "Демо спринта", "Отпуск"]) {
  console.log(`calendar contains "${needle}":`, bodyText.includes(needle));
}

step("manual resync button");
await page.goto(`${BASE}/settings`);
await page.locator('button[aria-label="Синхронизировать"]').first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/5-resync.png`, fullPage: true });
console.log("resync clicked, source text:", (await page.locator(".calendar-source").first().innerText()).slice(0, 300));

await browser.close();
console.log("\nDONE");
