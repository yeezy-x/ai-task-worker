import "./env.js";
import http from "node:http";
import { chromium, type Page } from "playwright";
import { runAgent, type AgentEvent } from "./agent.js";
import { createCompany, handleCompany, resetCompany, type Company } from "./company.js";

type Snapshot = {
  running: boolean;
  status: string;
  goal: string;
  question?: string;
  summary?: string;
  events: AgentEvent[];
};

const snapshot: Snapshot = { running: false, status: "idle", goal: "", events: [] };
let approvalWait: ((allowed: boolean) => void) | null = null;
let company: Company;
let page: Page;
let origin = "";

const pageHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>WorkPilot</title>
    <style>
      body { font-family: Georgia, serif; margin: 2rem auto; max-width: 46rem; line-height: 1.45; color: #1c1c1c; }
      textarea { width: 100%; min-height: 5rem; font: inherit; }
      button { font: inherit; margin-right: 0.5rem; }
      ol { padding-left: 1.2rem; }
      li { margin: 0.8rem 0; }
      .detail { white-space: pre-wrap; background: #f4f4f4; padding: 0.6rem; }
      .gate { border: 1px solid #222; padding: 1rem; margin: 1rem 0; }
    </style>
  </head>
  <body>
    <h1>WorkPilot</h1>
    <p>Give the agent a task. It will use the <a href="/">simulated company</a> and show each decision here.</p>
    <form id="task">
      <p><textarea name="goal">Find Acme's latest invoice, extract its details, enter it into Operations, save it, and mark the invoice final.</textarea></p>
      <p><button type="submit">Run task</button></p>
    </form>
    <p id="status"></p>
    <div id="gate" class="gate" hidden>
      <h2>Approval required</h2>
      <p id="reason"></p>
      <button type="button" id="approve">Approve</button>
      <button type="button" id="reject">Reject</button>
    </div>
    <h2>Timeline</h2>
    <ol id="timeline"></ol>
    <h2>Final evidence</h2>
    <pre id="summary"></pre>
    <script>
      const status = document.querySelector("#status");
      const timeline = document.querySelector("#timeline");
      const summary = document.querySelector("#summary");
      const gate = document.querySelector("#gate");
      const reason = document.querySelector("#reason");
      async function refresh() {
        const response = await fetch("/api/state");
        const state = await response.json();
        status.textContent = state.running ? "Running" : state.status;
        reason.textContent = state.question || "";
        gate.hidden = state.status !== "awaiting_approval";
        summary.textContent = state.summary || "";
        timeline.replaceChildren();
        for (const event of state.events) {
          const item = document.createElement("li");
          const title = document.createElement("strong");
          title.textContent = event.title;
          const detail = document.createElement("div");
          detail.className = "detail";
          detail.textContent = event.detail;
          item.append(title, detail);
          timeline.append(item);
        }
      }
      document.querySelector("#task").addEventListener("submit", async (event) => {
        event.preventDefault();
        const goal = new FormData(event.currentTarget).get("goal");
        await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal }) });
        refresh();
      });
      async function decide(approve) {
        await fetch("/api/approval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve }) });
        refresh();
      }
      document.querySelector("#approve").addEventListener("click", () => decide(true));
      document.querySelector("#reject").addEventListener("click", () => decide(false));
      refresh();
      setInterval(refresh, 1000);
    </script>
  </body>
</html>`;

function sendJson(res: http.ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function startRun(goal: string): Promise<void> {
  resetCompany(company);
  snapshot.running = true;
  snapshot.status = "running";
  snapshot.goal = goal;
  snapshot.question = undefined;
  snapshot.summary = undefined;
  snapshot.events = [];
  try {
  const state = await runAgent(page, goal, origin, {
    onEvent: (event) => {
      snapshot.events.push({ title: event.title, detail: event.detail.slice(0, 2000) });
      if (event.title === "Approval required") snapshot.status = "awaiting_approval";
      if (event.title === "Approval granted") snapshot.status = "running";
      if (event.title === "Completed") snapshot.summary = event.detail;
    },
    onApproval: (reason) =>
      new Promise((resolve) => {
        snapshot.status = "awaiting_approval";
        snapshot.question = reason;
        approvalWait = resolve;
      }),
  });
  snapshot.running = false;
  snapshot.status = state.status;
  snapshot.summary = state.summary;
  snapshot.question = state.question;
  } catch (error) {
    snapshot.running = false;
    snapshot.status = "blocked";
    snapshot.question = error instanceof Error ? error.message : String(error);
  } finally {
    approvalWait = null;
  }
}

const server = http.createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0] || "/";
  if (req.method === "GET" && path === "/demo") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(pageHtml);
    return;
  }
  if (req.method === "GET" && path === "/api/state") {
    sendJson(res, snapshot);
    return;
  }
  if (req.method === "POST" && path === "/api/run") {
    void readBody(req).then((raw) => {
      if (snapshot.running) return sendJson(res, { error: "A task is already running." }, 409);
      const goal = (JSON.parse(raw) as { goal?: string }).goal?.trim();
      if (!goal) return sendJson(res, { error: "Enter a task." }, 400);
      void startRun(goal);
      sendJson(res, { ok: true });
    }).catch(() => sendJson(res, { error: "Could not start the task." }, 400));
    return;
  }
  if (req.method === "POST" && path === "/api/approval") {
    void readBody(req).then((raw) => {
      const approve = (JSON.parse(raw) as { approve?: boolean }).approve === true;
      const wait = approvalWait;
      approvalWait = null;
      if (!wait) return sendJson(res, { error: "Nothing is waiting for approval." }, 409);
      wait(approve);
      sendJson(res, { ok: true });
    }).catch(() => sendJson(res, { error: "Could not record the decision." }, 400));
    return;
  }
  handleCompany(company, req, res).catch(() => {
    if (res.headersSent) return;
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal error");
  });
});

company = createCompany();
const browser = await chromium.launch({ headless: !process.env.DISPLAY });
page = await browser.newPage();
await new Promise<void>((resolve, reject) => {
  server.listen(Number(process.env.PORT ?? 3000), "127.0.0.1", () => resolve());
  server.once("error", reject);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Demo server did not bind to a port");
origin = `http://127.0.0.1:${address.port}`;
console.log(`Demo: ${origin}/demo`);
console.log(`Company: ${origin}/`);
