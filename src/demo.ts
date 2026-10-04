const baseUrl = process.env.WORKPILOT_URL ?? "http://127.0.0.1:3000";
const demos = await (await fetch(`${baseUrl}/api/demos`)).json() as string[];
for (const goal of demos) {
  const run = await (await fetch(`${baseUrl}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal }) })).json() as { id: string };
  process.stdout.write(`Started: ${goal}\n`);
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    const state = await (await fetch(`${baseUrl}/api/runs/${run.id}`)).json() as { status: string; finalSummary?: string; evidence?: string[] };
    if (["completed", "failed", "step_limit", "needs_approval"].includes(state.status)) { console.log(state); break; }
  }
}
