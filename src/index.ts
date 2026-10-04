import "./env.js";

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { chromium } from "playwright";

import { startServer } from "./server.js";
import { runAgent } from "./agent.js";

const defaultGoal =
  "Find Acme's latest invoice, extract its details, enter it into Operations, save it, and mark the invoice final.";

const goal =
  process.argv.slice(2).join(" ").trim() || defaultGoal;

const {server} = await startServer();
const url=company
const browser = await chromium.launch({
  headless: false,
  slowMo: 1000,
});

const readline = createInterface({
  input,
  output,
});

try {
  const page = await browser.newPage();

  console.log("");
  console.log("WorkPilot");
  console.log("---------");
  console.log(`Company: ${url}`);
  console.log(`Goal: ${goal}`);
  console.log("");

  const state = await runAgent(
    page,
    goal,
    url,
    {
      onEvent: (event) => {
        console.log(`[${event.title}] ${event.detail}`);
      },

      onApproval: async (reason) => {
        console.log("");
        console.log("Approval required:");
        console.log(reason);
        console.log("");

        const answer = await readline.question(
          "Approve? (y/n): "
        );

        const allowed =
          answer.trim().toLowerCase() === "y";

        console.log(
          allowed
            ? "Approval granted."
            : "Approval denied."
        );

        return allowed;
      },
    }
  );

  console.log("");
  console.log("Final status:", state.status);

  if (state.summary) {
    console.log("Summary:", state.summary);
  }

  if (state.question) {
    console.log("Question:", state.question);
  }

  console.log("");

  console.log("Facts:");
  console.log(JSON.stringify(state.facts, null, 2));

  console.log("");

  console.log("Completed actions:");
  console.log(JSON.stringify(state.completedActions, null, 2));

  console.log("");

  console.log("Failed actions:");
  console.log(JSON.stringify(state.failedActions, null, 2));

  console.log("--------------------------------");
  console.log("WorkPilot completed successfully.");
} finally {
  readline.close();
  await browser.close();
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}