const taskForm = document.querySelector("#task-form");
const goalInput = document.querySelector("#goal");
const runButton = document.querySelector("#run-button");
const runStatus = document.querySelector("#run-status");
const eventCount = document.querySelector("#event-count");
const timeline = document.querySelector("#timeline");
const summary = document.querySelector("#summary");
const approvalCard = document.querySelector("#approval-card");
const approvalReason = document.querySelector("#approval-reason");
const approveButton = document.querySelector("#approve-button");
const rejectButton = document.querySelector("#reject-button");

if (
  !taskForm ||
  !goalInput ||
  !runButton ||
  !runStatus ||
  !eventCount ||
  !timeline ||
  !summary ||
  !approvalCard ||
  !approvalReason ||
  !approveButton ||
  !rejectButton
) {
  throw new Error("WorkPilot UI failed to initialize.");
}

let refreshTimer;

async function requestJson(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      body || `Request failed with status ${response.status}`
    );
  }

  return await response.json();
}

function setRunStatus(status) {
  runStatus.className = `status-badge ${status}`;

  switch (status) {
    case "running":
      runStatus.textContent = "Running";
      break;

    case "complete":
      runStatus.textContent = "Completed";
      break;

    case "awaiting_approval":
      runStatus.textContent = "Approval required";
      break;

    case "blocked":
      runStatus.textContent = "Blocked";
      break;

    default:
      runStatus.textContent = "Idle";
      break;
  }
}

function renderTimeline(events) {
  eventCount.textContent = `${events.length} ${
    events.length === 1 ? "event" : "events"
  }`;

  if (events.length === 0) {
    timeline.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">○</div>
        <p>No task is running.</p>
        <span>
          Start a task to see WorkPilot's decisions and observations.
        </span>
      </div>
    `;

    return;
  }

  timeline.replaceChildren();

  for (const event of events) {
    const container = document.createElement("div");
    container.className = "timeline-event";

    const title = document.createElement("div");
    title.className = "event-title";
    title.textContent = event.title;

    const detail = document.createElement("div");
    detail.className = "event-detail";
    detail.textContent = event.detail;

    container.append(title, detail);
    timeline.appendChild(container);
  }
}

function renderSummary(state) {
  const value = state.summary?.trim();

  if (!value) {
    summary.className = "summary empty-summary";
    summary.textContent = "WorkPilot has not completed a task yet.";
    return;
  }

  summary.className = "summary";
  summary.textContent = value;
}

function renderApproval(state) {
  const waiting = state.status === "awaiting_approval";

  approvalCard.classList.toggle("hidden", !waiting);

  if (waiting) {
    approvalReason.textContent =
      state.question || "WorkPilot requires your approval.";
  }
}

function renderRunButton(state) {
  runButton.disabled = state.running;

  const label = runButton.querySelector("span");

  if (!label) {
    return;
  }

  label.textContent = state.running ? "Running..." : "Run task";
}

function render(state) {
  setRunStatus(state.status);
  renderTimeline(state.events);
  renderSummary(state);
  renderApproval(state);
  renderRunButton(state);
}

async function refresh() {
  try {
    const state = await requestJson("/api/state");
    render(state);
  } catch (error) {
    console.error("Failed to refresh WorkPilot state:", error);
  }
}

async function runTask(goal) {
  await requestJson("/api/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ goal }),
  });

  await refresh();
}

async function decideApproval(approve) {
  approveButton.disabled = true;
  rejectButton.disabled = true;

  try {
    await requestJson("/api/approval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        approve,
      }),
    });

    await refresh();
  } catch (error) {
    console.error("Failed to submit approval decision:", error);
  } finally {
    approveButton.disabled = false;
    rejectButton.disabled = false;
  }
}

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const goal = goalInput.value.trim();

  if (!goal) {
    goalInput.focus();
    return;
  }

  runButton.disabled = true;

  try {
    await runTask(goal);
  } catch (error) {
    console.error("Failed to start task:", error);
    await refresh();
  }
});

approveButton.addEventListener("click", () => {
  void decideApproval(true);
});

rejectButton.addEventListener("click", () => {
  void decideApproval(false);
});

void refresh();

refreshTimer = window.setInterval(() => {
  void refresh();
}, 1000);

window.addEventListener("beforeunload", () => {
  if (refreshTimer !== undefined) {
    window.clearInterval(refreshTimer);
  }
});