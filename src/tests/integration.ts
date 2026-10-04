import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startApp } from "../server.js";
import { resetCompany } from "../company.js";

const server = await startApp(0);
const address = server.address() as { port: number };
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${base}/inbox`);
  assert.match(await page.locator("body").innerText(), /Invoice ACME-104/);
  await page.getByTestId("open-message-msg-acme-104").click();
  assert.match(await page.getByTestId("message-detail").innerText(), /\$2,450.00/);

  await page.goto(`${base}/operations`);
  await page.getByTestId("invoice-reference").fill("ACME-104");
  await page.getByTestId("invoice-customer").fill("Acme Corporation");
  await page.getByTestId("invoice-amount").fill("$2,450.00");
  await page.getByTestId("invoice-source-message").fill("msg-acme-104");
  await page.getByTestId("save-invoice").click();
  assert.match(await page.getByTestId("operations-error").innerText(), /DUPLICATE_REFERENCE/);
  await page.getByTestId("invoice-reference").fill("ACME-104-REV1");
  await page.getByTestId("invoice-customer").fill("Acme Corporation");
  await page.getByTestId("invoice-amount").fill("$2,450.00");
  await page.getByTestId("invoice-source-message").fill("msg-acme-104");
  await page.getByTestId("save-invoice").click();
  assert.match(await page.getByTestId("invoice-ACME-104-REV1").innerText(), /Acme Corporation/);

  await page.goto(`${base}/crm`);
  await page.getByTestId("crm-status-select-cust-acme").selectOption({ label: "Needs follow-up" });
  await page.getByTestId("save-crm-cust-acme").click();
  assert.match(await page.getByTestId("crm-status-cust-acme").innerText(), /Needs follow-up/);

  await page.goto(`${base}/support`);
  for (const id of ["SUP-401", "SUP-397"]) {
    await page.getByTestId(`ticket-note-input-${id}`).fill("Engineering review required");
    await page.getByTestId(`save-note-${id}`).click();
    assert.match(await page.getByTestId(`ticket-note-${id}`).innerText(), /Engineering review required/);
  }
  console.log("Integration checks passed: simulated company workflows and controlled recovery are functional.");
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  resetCompany();
}
