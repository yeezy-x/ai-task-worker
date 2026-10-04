import { chromium } from "playwright";
import { startServer } from "./server.js";
import { runAgent } from "./agent.js";

const goal = "Open the company inbox and find Acme's latest invoice.";

const server = await startServer();
const browser = await chromium.launch({ headless: false, slowMo:500 });
try {
  const page = await browser.newPage();
  const state = await runAgent(page, goal, server.url);
  console.log(`Final Agent Status: ${state.status}`);
  if (state.summary) console.log(`Final Agent Summary: ${state.summary}`);
  if (state.question) console.log(`Final Agent Question: ${state.question}`);
} finally {
  await browser.close();
  await server.close();
}