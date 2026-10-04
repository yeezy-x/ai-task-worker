import "./env.js";
import { chromium } from "playwright";
import { startServer } from "./server.js";
import { runAgent } from "./agent.js";

const defaultGoal = "Find Acme's latest invoice, extract its details, enter it into Operations, and save it.";
const goal = process.argv.slice(2).join(" ").trim() || defaultGoal;

const server = await startServer();
const headed = Boolean(process.env.DISPLAY);
const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 1000 : 0 });
try {
  const page = await browser.newPage();
  const state = await runAgent(page, goal, server.url, {
    onApproval: async (reason) => {
      console.log(`Approval requested: ${reason}`);
      const allowed = process.env.AGENT_APPROVAL === "approve";
      console.log(allowed ? "Approval granted by AGENT_APPROVAL." : "Approval denied by AGENT_APPROVAL.");
      return allowed;
    },
  });
  const freshRead = state.completedActions.at(-1)?.startsWith("browser.extract") ?? false;
  const summary = state.summary ?? "";
  const reusedFacts = state.completedActions.some(
    (action) =>
      action.startsWith("browser.fill") &&
      state.facts.some((fact) => {
        const value = fact.slice(fact.indexOf(":") + 1).trim();
        return value.length > 1 && action.includes(value);
      }),
  );
  const source = server.company.inbox
    .filter((message) => message.customer === "Acme" && message.invoiceNumber)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
  const saved = source
    ? server.company.invoices.find(
        (invoice) =>
          invoice.customer === source.customer &&
          invoice.invoiceNumber === source.invoiceNumber &&
          invoice.invoiceDate === source.invoiceDate &&
          invoice.amount === source.amount &&
          source.lineItems.every((item) =>
            invoice.lineItems.includes(`${item.description}: ${item.amount}`),
          ),
      )
    : undefined;
  let pageVerified = false;
  if (saved) {
    await page.goto(`${server.url}/operations/${saved.id}`);
    const text = await page.locator("body").innerText();
    pageVerified =
      text.includes("Status: saved") &&
      text.includes(saved.customer) &&
      text.includes(saved.invoiceNumber) &&
      text.includes(saved.amount);
  }
  const recovered = state.failedActions.some((entry) => /pending record/i.test(entry));
  const note = goal.match(/\b(?:add|leave)\s+(?:an?\s+)?(.+?)\s+note\b/i)?.[1]?.trim();
  const acmeTickets = server.company.tickets.filter((ticket) => ticket.customer === "Acme");
  const latestTicket = [...acmeTickets].sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0];
  const urgentTickets = acmeTickets.filter((ticket) => ticket.priority === "high" && ticket.status === "open");
  const acme = server.company.customers.find((customer) => customer.name === "Acme");
  const invoiceVerified =
    state.status === "complete" &&
    saved !== undefined &&
    pageVerified &&
    freshRead &&
    Boolean(source) &&
    summary.includes(source!.customer) &&
    summary.includes(source!.invoiceNumber) &&
    summary.includes(source!.amount) &&
    /verif/i.test(summary) &&
    /saved/i.test(summary) &&
    reusedFacts &&
    recovered &&
    state.facts.some((fact) => fact.includes(source?.invoiceNumber ?? "\u0000"));
  const crmVerified =
    state.status === "complete" &&
    freshRead &&
    acme?.status === "Under Review" &&
    latestTicket !== undefined &&
    state.facts.some((fact) => fact.startsWith("Record:") && fact.includes(latestTicket.subject)) &&
    state.facts.some((fact) => fact.startsWith("Verified:") && fact.includes("Under Review")) &&
    summary.includes(latestTicket.subject) &&
    summary.includes("Acme") &&
    summary.includes("Under Review") &&
    /verif/i.test(summary) &&
    server.company.customers.find((customer) => customer.name === "Globex")?.status === "Standard";
  const ticketsVerified =
    state.status === "complete" &&
    freshRead &&
    Boolean(note) &&
    urgentTickets.length > 0 &&
    urgentTickets.every(
      (ticket) =>
        ticket.notes.some((entry) => entry.toLowerCase().includes(note!.toLowerCase())) &&
        state.facts.some(
          (fact) =>
            fact.startsWith("Verified:") &&
            fact.includes(ticket.subject) &&
            fact.toLowerCase().includes(note!.toLowerCase()),
        ) &&
        summary.includes(ticket.subject),
    ) &&
    summary.toLowerCase().includes(note!.toLowerCase()) &&
    /verif/i.test(summary) &&
    server.company.tickets
      .filter((ticket) => !urgentTickets.includes(ticket))
      .every((ticket) => ticket.notes.length === 0);
  const finalize = /\bmark\b/i.test(goal) && /\bfinal\b/i.test(goal);
  const finalInvoice = source
    ? server.company.invoices.find((invoice) => invoice.invoiceNumber === source.invoiceNumber && invoice.finalized)
    : undefined;
  let finalPage = false;
  if (finalInvoice) {
    await page.goto(`${server.url}/operations/${finalInvoice.id}`);
    const text = await page.locator("body").innerText();
    finalPage = text.includes("Status: final") && text.includes(finalInvoice.invoiceNumber) && text.includes(finalInvoice.amount);
  }
  const finalizedAny = server.company.invoices.some((invoice) => invoice.finalized);
  const finalizeVerified = process.env.AGENT_APPROVAL === "approve"
    ? state.status === "complete" &&
      finalInvoice !== undefined &&
      finalPage &&
      freshRead &&
      /verif/i.test(summary) &&
      /final/i.test(summary) &&
      recovered &&
      state.approved === true
    : state.status === "blocked" &&
      /denied/i.test(state.question ?? "") &&
      !finalizedAny &&
      !state.completedActions.some((action) => action.includes("Mark invoice final"));
  const scenario = finalize ? "finalize" : note ? "tickets" : /\binvoice\b/i.test(goal) ? "invoice" : "crm";
  const verified = scenario === "finalize"
    ? finalizeVerified
    : scenario === "tickets"
      ? ticketsVerified
      : scenario === "invoice"
        ? invoiceVerified
        : crmVerified;
  console.log(`Facts: ${JSON.stringify(state.facts, null, 2)}`);
  console.log(`Facts reused in later fills: ${reusedFacts}`);
  console.log(`Fresh verification read: ${freshRead}`);
  console.log(`Saved invoices: ${JSON.stringify(server.company.invoices, null, 2)}`);
  console.log(`CRM: ${JSON.stringify(server.company.customers, null, 2)}`);
  console.log(`Tickets: ${JSON.stringify(server.company.tickets.map((ticket) => ({ id: ticket.id, customer: ticket.customer, priority: ticket.priority, status: ticket.status, notes: ticket.notes })), null, 2)}`);
  console.log(`Failed actions: ${JSON.stringify(state.failedActions, null, 2)}`);
  console.log(`Final Agent Status: ${state.status}`);
  if (state.summary) console.log(`Final Agent Summary: ${state.summary}`);
  if (state.question) console.log(`Final Agent Question: ${state.question}`);
  console.log(`Scenario: ${scenario}`);
  console.log(`Checkpoint: ${verified ? "verified completion" : "not verified"}`);
  if (!verified) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}