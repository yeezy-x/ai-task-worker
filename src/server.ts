import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URLSearchParams } from "node:url";
import { crm, home, inbox, message, operations, performForm, support } from "./html.js";
import { resetCompany } from "./company.js";
import { TaskRunner } from "./agent.js";
import type { AgentState } from "./types.js";

const runs = new Map<string, AgentState>();
const demos = [
  "Process Acme Corporation's latest invoice from the Inbox into Operations. Handle any application error safely and verify the processed invoice in Operations.",
  "Find Acme Corporation's latest support request and update the Acme CRM record status accordingly. Verify the CRM status after saving.",
  "Find every unresolved high-priority Acme Corporation support ticket, add the internal note Engineering review required to each, and verify the notes."
];

function send(response: ServerResponse, status: number, content: string, type = "text/html; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(content);
}
function parseBody(request: IncomingMessage) {
  return new Promise<Record<string, string>>((resolve) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => { raw += chunk; });
    request.on("end", () => {
      const type = request.headers["content-type"] ?? "";
      if (type.includes("application/json")) { try { resolve(JSON.parse(raw) as Record<string, string>); } catch { resolve({}); } return; }
      resolve(Object.fromEntries(new URLSearchParams(raw)));
    });
  });
}

const workerUi = () => `<!doctype html><html><head><meta charset="utf-8"><title>WorkPilot</title><style>body{font:16px system-ui;margin:0;background:#0e1424;color:#eaf0ff}.wrap{max-width:1000px;margin:0 auto;padding:45px 24px}textarea{width:100%;box-sizing:border-box;min-height:100px;font:inherit;padding:12px;border-radius:8px;border:1px solid #52617c}button{font:inherit;padding:10px 14px;border:0;border-radius:7px;background:#6d9cff;color:#08101f;font-weight:700;cursor:pointer;margin:10px 8px 10px 0}.demo{background:#263654;color:#dbe7ff}.card{background:#182238;border:1px solid #2d3d5a;border-radius:10px;padding:18px;margin-top:18px}.event{padding:10px 0;border-bottom:1px solid #31405e}.ok{color:#83e2aa}.bad{color:#ff9da5}.meta{color:#a9b8d5;font-size:13px}#company{position:absolute;right:24px;top:18px;color:#b9ccff}</style></head><body><a id="company" href="/">Open simulated company</a><div class="wrap"><h1>WorkPilot</h1><p>Enter a company objective. The worker chooses one browser action at a time, observes outcomes, and must verify the final state before it can complete.</p><textarea id="goal" placeholder="Describe the task you want completed"></textarea><div><button id="run">Run task</button><button class="demo" data-demo="0">Demo: invoice</button><button class="demo" data-demo="1">Demo: CRM</button><button class="demo" data-demo="2">Demo: tickets</button></div><section class="card"><strong id="status">Waiting for a task</strong><p id="summary"></p><div id="evidence"></div><div id="timeline"></div></section></div><script>const goal=document.querySelector('#goal'),status=document.querySelector('#status'),summary=document.querySelector('#summary'),timeline=document.querySelector('#timeline'),evidence=document.querySelector('#evidence');let timer;const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));async function start(text){if(!text.trim())return;clearInterval(timer);timeline.innerHTML='';summary.textContent='';evidence.innerHTML='';status.textContent='Starting…';const r=await fetch('/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({goal:text})});const run=await r.json();timer=setInterval(async()=>{const state=await (await fetch('/api/runs/'+run.id)).json();status.textContent='Status: '+state.status;timeline.innerHTML=state.observations.map(o=>'<div class="event '+(o.ok?'ok':'bad')+'"><span class="meta">'+esc(o.at)+' · '+esc(o.action)+'</span><br>'+esc(o.summary)+'</div>').join('');summary.textContent=state.finalSummary||'';evidence.innerHTML=(state.evidence||[]).map(x=>'<div class="ok">Verified: '+esc(x)+'</div>').join('');if(['completed','failed','step_limit','needs_approval'].includes(state.status))clearInterval(timer)},600)}document.querySelector('#run').onclick=()=>start(goal.value);document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=async()=>{const d=await (await fetch('/api/demos')).json();goal.value=d[Number(b.dataset.demo)];start(goal.value)});</script></body></html>`;

export function makeApp() {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/workpilot") return send(response, 200, workerUi());
    if (request.method === "GET" && url.pathname === "/api/demos") return send(response, 200, JSON.stringify(demos), "application/json");
    if (request.method === "POST" && url.pathname === "/api/reset") { resetCompany(); return send(response, 204, ""); }
    if (request.method === "POST" && url.pathname === "/api/runs") {
      const { goal = "" } = await parseBody(request);
      if (!goal.trim()) return send(response, 400, JSON.stringify({ error: "goal is required" }), "application/json");
      const baseUrl = `http://127.0.0.1:${(request.socket.localPort ?? 3000)}`;
      const runner = new TaskRunner(baseUrl, goal, (state) => runs.set(state.id, state));
      runs.set(runner.state.id, runner.state);
      void runner.run();
      return send(response, 202, JSON.stringify({ id: runner.state.id }), "application/json");
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/runs/")) {
      const state = runs.get(url.pathname.split("/").pop() ?? "");
      return state ? send(response, 200, JSON.stringify(state), "application/json") : send(response, 404, JSON.stringify({ error: "not found" }), "application/json");
    }
    if (request.method === "POST" && request.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
      const fields = await parseBody(request); const result = performForm(url.pathname, fields);
      response.writeHead(303, { location: result.redirect }); return response.end();
    }
    if (request.method === "GET" && url.pathname === "/") return send(response, 200, home());
    if (request.method === "GET" && url.pathname === "/inbox") return send(response, 200, inbox());
    if (request.method === "GET" && url.pathname.startsWith("/inbox/")) return send(response, 200, message(url.pathname.split("/").pop() ?? ""));
    if (request.method === "GET" && url.pathname === "/crm") return send(response, 200, crm());
    if (request.method === "GET" && url.pathname === "/support") return send(response, 200, support());
    if (request.method === "GET" && url.pathname === "/operations") return send(response, 200, operations(url.searchParams.get("error") ?? ""));
    return send(response, 404, "Not found", "text/plain");
  });
}

export async function startApp(port = Number(process.env.PORT ?? 3000)) {
  const app = makeApp();
  await new Promise<void>((resolve) => app.listen(port, "127.0.0.1", resolve));
  return app;
}

if (process.argv[1]?.endsWith("server.ts")) {
  const server = await startApp();
  console.log(`WorkPilot is running at http://127.0.0.1:${(server.address() as { port: number }).port}/workpilot`);
}
