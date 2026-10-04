# WorkPilot — Autonomous AI Task Worker

WorkPilot is a deliberately narrow, local prototype of an autonomous task worker. A user enters a natural-language objective; one LLM-driven agent then chooses generic browser actions, observes the real state of a simulated company, handles a controlled failure, verifies the final state, and returns evidence.

It intentionally has no authentication, external company credentials, long-term memory, vector database, multi-agent system, or arbitrary-web access.

## Requirements

- Node.js 20+
- A Gemini API key (from Google AI Studio)
- Chromium for Playwright (`npx playwright install chromium`)

## Run

```bash
cp .env.example .env
# Set GEMINI_API_KEY. The default endpoint and model use Gemini's OpenAI-compatible API.
npm install
npx playwright install chromium
npm run dev
```

Open `http://127.0.0.1:3000`. The three demo buttons enter natural-language objectives; they do not select a task-specific workflow.

## What is implemented

- Simulated Inbox, CRM, Support, and Operations applications with seeded company data.
- One browser-based agent loop. The model receives the current task, working state, and generic browser tools, and selects exactly one next action at a time.
- Generic Playwright tools: navigate, read, click, fill, and select. Each returns a structured observation.
- In-process working memory: goal, observations, facts, completed actions, failed actions, and status.
- A real controlled duplicate-reference failure while processing the latest invoice. The observation includes the safe alternative reference; the agent must replan rather than silently succeeding.
- Mandatory post-mutation browser reads before completion. Completion is rejected until a final-state verification read is present.
- A minimal live UI that displays the execution timeline, status, verification evidence, and concise completion summary.

## Demonstrations

1. Process Acme's latest invoice from Inbox into Operations and verify it.
2. Find Acme's latest support request and update its CRM status, then verify it.
3. Find unresolved high-priority Acme tickets, add an engineering-review note to each, and verify the notes.

## Architecture

```text
Task input -> Task manager -> Agent loop -> LLM chooses one tool action
                                      -> Playwright -> simulated company app
                                      <- structured observation
                                      -> working memory -> replan / verify / evidence
```

The backend and local company app are intentionally one small Node/TypeScript service. Browser interaction is constrained to `127.0.0.1`; the agent cannot navigate to arbitrary websites.

## Model contract

The model must respond with JSON only. It may choose a browser action, ask for approval, or complete the task. The server validates the action and does not allow completion unless a browser read occurred after the last mutation. This is a prototype safety boundary, not a complete sandbox.

## Assumptions and limitations

- The app resets to its seed data on restart.
- It requires a model that reliably follows JSON instructions and a user-supplied API key.
- Human approval is intentionally omitted because none of the three defined demonstrations performs a risky or destructive action.
- There is no persistence, authentication, OCR, external-system connectivity, or arbitrary website support.
- The local planner in `.env.example` exists solely for offline smoke testing; it is not the normal autonomous mode.

## Verification

```bash
npm run check
npm test
```

`npm test` exercises the simulated environment and the generic browser tools with Playwright. To run the three autonomous demonstrations, start the app with Gemini credentials and use the UI (or `npm run demo`).
