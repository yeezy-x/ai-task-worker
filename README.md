# WorkPilot

WorkPilot is a small autonomous task worker. You give it a plain-language task. It decides the next browser action, reads what the page shows, remembers useful facts, and finishes only after a fresh read confirms the result.

It works on a local simulated company with an inbox, operations, support, and CRM. It is not a general browser agent.

## Problem

Company work often repeats the same steps: find a record, copy the details, update another record, and check that the update stuck. WorkPilot practices that loop on three tasks:

- Enter Acme's latest invoice into Operations.
- Update Acme's CRM record from the latest support request.
- Add an engineering review note to each unresolved high-priority Acme ticket.

## Architecture

```text
Task
 ↓
Agent
 ↓
AgentState
 ↓
Generic browser tools
 ↓
Simulated company
 ↓
Observation
 ↓
Replanning
 ↓
Verification
```

One loop does every task. The model returns one JSON decision. The agent runs one generic browser tool, stores the observation and any facts, and asks the model what to do next. A click is not treated as success. After a change, the agent reads the page again and completes only when that read shows the requested result.

There is no second agent, workflow engine, or business-specific tool.

## Setup

Requirements: Node.js, npm, and [Ollama](https://ollama.com/).

```bash
npm install
npx playwright install chromium
ollama serve
ollama pull qwen2.5-coder:3b
cp .env.example .env
```

`.env` holds only the local model settings:

```text
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:3b
AGENT_MAX_STEPS=30
MAX_FAILURE_REPLANS=3
```

The agent talks to Ollama through `complete()` in `src/llm.ts`. The rest of the agent does not know which model is behind that function.

## Run

Run one task in the terminal. The company server starts on a random local port and shuts down when the task ends.

```bash
npm run dev
```

That default task enters Acme's latest invoice. Pass another task as arguments:

```bash
npm run dev -- "Find the latest support request from Acme and update the corresponding CRM record to reflect that the issue is being reviewed."
```

The process prints each decision, tool result, and a final checkpoint. Exit code 0 means the company state and the agent's summary matched the task.

Start the demo UI and the company together:

```bash
npm run demo
```

Open `http://127.0.0.1:3000/demo` for the task box and timeline. Open `http://127.0.0.1:3000/` for the company pages. Each demo run resets the company data.

## Example tasks

Invoice:

> Find Acme's latest invoice, extract its details, enter it into Operations, and save it.

Support, then CRM:

> Find the latest support request from Acme and update the corresponding CRM record to reflect that the issue is being reviewed.

High-priority tickets:

> Find unresolved high-priority support tickets from Acme and add an engineering review note to each relevant ticket.

Invoice finalization, which pauses for a person:

> Find Acme's latest invoice, extract its details, enter it into Operations, save it, and mark the invoice final.

## Technical decisions

- **One agent.** A single loop keeps the trace easy to read. A new task is a new sentence, not a new program.
- **Generic browser tools.** The tools are `browser.navigate`, `browser.extract`, `browser.click`, and `browser.fill`. They report success, the URL, the visible page, and an error when something fails. There is no tool that means "save the Acme invoice."
- **In-process AgentState.** Facts, observations, completed actions, and failed actions live in memory for that run. Nothing is written to a database.
- **Playwright.** It drives a real browser against the local company so the agent sees links, fields, and alerts.
- **Local company.** Inbox, Operations, Support, and CRM are fixed seed data. Runs can be repeated.
- **Ollama.** The model runs on the same machine. `complete()` is the only model call.
- **Fresh verification.** After a save, update, or note, the agent calls `browser.extract` and quotes that read in the summary.
- **Bounded recovery.** The same failed action is not repeated on the same page. Three repeats of the same failure stop the run. `AGENT_MAX_STEPS` caps the length.

The local model is steered by a "Next" line built from the current page, stored facts, and the goal. That hint is still a suggestion inside the same loop: the model emits the action, the tool runs, and the next hint is computed from the new observation. Section choice uses the goal's words only to pick Inbox or Support as the list to open. The records themselves are chosen from dates, customer, priority, and status printed on the page.

## Failure recovery

Saving Acme's latest invoice, INV-2048, fails on purpose the first time. The page says a pending record must be reviewed. The agent stores that failed action, opens the pending record, confirms it, and only then reads the saved invoice. The summary has to mention the failed save and the values from the later read.

## Human approval

"Mark invoice final" is the only approval gate. After the invoice is saved, the agent stops and asks for approval before clicking **Mark invoice final**. Approve continues the click, then a fresh read must show `Status: final`. Reject stops the run and leaves the invoice unfinalized.

In the terminal, set `AGENT_APPROVAL=approve` or leave it unset to deny. The demo shows Approve and Reject buttons.

## Verification

Completion requires the last successful action to be `browser.extract` and the summary to quote the resulting values. The terminal checkpoint also reads the company records after the run. A successful click without that read does not pass.

## Assumptions

- Ollama is running and the model named in `.env` is already pulled.
- Tasks refer to the bundled company, not an outside website.
- "Latest" means the newest Received or Opened date shown for the named customer.
- "Being reviewed" or "under review" is written as the CRM status `Under Review`.
- An engineering review note uses the note phrase from the task.
- Unresolved tickets are the ones whose status is not `resolved`.
- Urgent tickets are the ones marked high priority.
- One demo run happens at a time.

## Limitations

- The company is a narrow simulated site.
- The browser tools cannot select from a dropdown, upload files, or use vision.
- Results depend on a small local model following the next-step hint.
- The agent is not meant for arbitrary websites.
- There is no login, permission model, or multi-user safety beyond the single approval pause.
- Memory lasts for one task and is discarded when the process moves on.
- The demo is a plain page, not a product UI.

## What I would build with more time

- Richer browser actions and stronger checks that an element is the one the model named.
- A planner that can revise a whole remaining list when the page changes.
- Durable memory across tasks, with a clear retention policy.
- Authentication and a real permission model.
- Tracing for model, tool, and latency without printing full page text.
- Evaluation across more models and phrasing, not only the three scripted tasks.

## Models, APIs, and frameworks

- Node.js and TypeScript, run with `tsx`
- Playwright for the browser
- Ollama's OpenAI-compatible chat API, called with `fetch` from `src/llm.ts`
- The example model is `qwen2.5-coder:3b`

No other model provider is used by the running agent.
