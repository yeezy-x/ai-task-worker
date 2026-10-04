import type { IncomingMessage, ServerResponse } from "node:http";

type LineItem = {
  description: string;
  amount: string;
};

type InboxMessage = {
  id: string;
  receivedAt: string;
  from: string;
  subject: string;
  customer: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: string;
  lineItems: LineItem[];
};

type SavedInvoice = {
  id: string;
  customer: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: string;
  lineItems: string;
  finalized?: boolean;
};

type PendingInvoice = SavedInvoice & {
  confirmed: boolean;
};

type Ticket = {
  id: string;
  customer: string;
  subject: string;
  priority: "high" | "normal" | "low";
  status: "open" | "resolved";
  openedAt: string;
  body: string;
  requestedStatus: string;
  notes: string[];
};

type Customer = {
  id: string;
  name: string;
  status: string;
};

export type Company = {
  inbox: InboxMessage[];
  invoices: SavedInvoice[];
  pendingInvoice: PendingInvoice;
  tickets: Ticket[];
  customers: Customer[];
  nextInvoiceId: number;
};

const inboxSeed: InboxMessage[] = [
  {
    id: "acme-inv-2048",
    receivedAt: "2026-09-28",
    from: "billing@acme.example",
    subject: "Acme invoice INV-2048",
    customer: "Acme",
    invoiceNumber: "INV-2048",
    invoiceDate: "2026-09-28",
    amount: "4750.00",
    lineItems: [
      { description: "Platform subscription", amount: "3500.00" },
      { description: "Implementation", amount: "1250.00" },
    ],
  },
  {
    id: "acme-inv-1001",
    receivedAt: "2026-08-12",
    from: "billing@acme.example",
    subject: "Acme invoice INV-1001",
    customer: "Acme",
    invoiceNumber: "INV-1001",
    invoiceDate: "2026-08-12",
    amount: "1200.00",
    lineItems: [{ description: "Support retainer", amount: "1200.00" }],
  },
  {
    id: "weekly-digest",
    receivedAt: "2026-08-01",
    from: "news@workpilot.example",
    subject: "Weekly digest",
    customer: "",
    invoiceNumber: "",
    invoiceDate: "",
    amount: "",
    lineItems: [],
  },
];

const invoiceSeed: SavedInvoice[] = [
  {
    id: "op-1",
    customer: "Acme",
    invoiceNumber: "INV-1001",
    invoiceDate: "2026-08-12",
    amount: "1200.00",
    lineItems: "Support retainer: 1200.00",
  },
];

const ticketSeed: Ticket[] = [
  {
    id: "acme-status-request",
    customer: "Acme",
    subject: "Set Acme CRM status to Enterprise",
    priority: "normal",
    status: "open",
    openedAt: "2026-10-02",
    body: "Acme asked us to change their account standing. Please set the CRM status to Enterprise.",
    requestedStatus: "Enterprise",
    notes: [],
  },
  {
    id: "acme-api-timeouts",
    customer: "Acme",
    subject: "Checkout API timeouts",
    priority: "high",
    status: "open",
    openedAt: "2026-09-20",
    body: "Acme checkout calls are timing out during peak traffic.",
    requestedStatus: "",
    notes: [],
  },
  {
    id: "acme-billing-export",
    customer: "Acme",
    subject: "Nightly billing export fails",
    priority: "high",
    status: "open",
    openedAt: "2026-09-18",
    body: "Acme's nightly billing export has failed for three nights.",
    requestedStatus: "",
    notes: [],
  },
  {
    id: "acme-logo-refresh",
    customer: "Acme",
    subject: "Logo refresh for the customer portal",
    priority: "low",
    status: "resolved",
    openedAt: "2026-07-03",
    body: "The portal logo was replaced last quarter.",
    requestedStatus: "",
    notes: [],
  },
  {
    id: "globex-sso",
    customer: "Globex",
    subject: "SSO outage",
    priority: "high",
    status: "open",
    openedAt: "2026-09-22",
    body: "Globex employees cannot sign in with SSO.",
    requestedStatus: "",
    notes: [],
  },
];

const customerSeed: Customer[] = [
  { id: "acme", name: "Acme", status: "Standard" },
  { id: "globex", name: "Globex", status: "Standard" },
];

export function resetCompany(company: Company): void {
  const fresh = createCompany();
  company.inbox = fresh.inbox;
  company.invoices = fresh.invoices;
  company.pendingInvoice = fresh.pendingInvoice;
  company.tickets = fresh.tickets;
  company.customers = fresh.customers;
  company.nextInvoiceId = fresh.nextInvoiceId;
}

export function createCompany(): Company {
  return {
    inbox: structuredClone(inboxSeed),
    invoices: structuredClone(invoiceSeed),
    pendingInvoice: {
      id: "pending-inv-2048",
      customer: "Acme",
      invoiceNumber: "INV-2048",
      invoiceDate: "2026-09-28",
      amount: "4750.00",
      lineItems: "Platform subscription: 3500.00\nImplementation: 1250.00",
      confirmed: false,
    },
    tickets: structuredClone(ticketSeed),
    customers: structuredClone(customerSeed),
    nextInvoiceId: 2,
  };
}

export async function handleCompany(
  company: Company,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method ?? "GET";
  const path = normalizePath(req.url ?? "/");
  if (method === "GET" && path === "/") {
    return sendHtml(res, layout("Home", homePage()));
  }
  if (method === "GET" && path === "/inbox") {
    return sendHtml(res, layout("Inbox", inboxListPage(company)));
  }
  if (method === "GET" && path === "/operations") {
    return sendHtml(res, layout("Operations", operationsListPage(company)));
  }
  if (method === "GET" && path === "/operations/new") {
    return sendHtml(res, layout("New invoice", invoiceFormPage()));
  }
  if (method === "GET" && path === "/support") {
    return sendHtml(res, layout("Support", supportListPage(company)));
  }
  if (method === "GET" && path === "/crm") {
    return sendHtml(res, layout("CRM", crmListPage(company)));
  }

  const inboxMatch = path.match(/^\/inbox\/([^/]+)$/);
  if (method === "GET" && inboxMatch) {
    const message = company.inbox.find((item) => item.id === inboxMatch[1]);
    if (!message) return sendHtml(res, layout("Not found", notFoundPage()), 404);
    return sendHtml(res, layout(message.subject, inboxDetailPage(message)));
  }

  if (method === "GET" && path === "/operations/pending-inv-2048") {
    return sendHtml(
      res,
      layout(
        company.pendingInvoice.invoiceNumber,
        pendingInvoicePage(company.pendingInvoice),
      ),
    );
  }

  const operationMatch = path.match(/^\/operations\/([^/]+)$/);
  if (method === "GET" && operationMatch && operationMatch[1] !== "new") {
    const invoice = company.invoices.find((item) => item.id === operationMatch[1]);
    if (!invoice) return sendHtml(res, layout("Not found", notFoundPage()), 404);
    return sendHtml(res, layout(invoice.invoiceNumber, invoiceDetailPage(invoice)));
  }

  const supportMatch = path.match(/^\/support\/([^/]+)$/);
  if (method === "GET" && supportMatch) {
    const ticket = company.tickets.find((item) => item.id === supportMatch[1]);
    if (!ticket) return sendHtml(res, layout("Not found", notFoundPage()), 404);
    return sendHtml(res, layout(ticket.subject, ticketDetailPage(ticket)));
  }

  const crmMatch = path.match(/^\/crm\/([^/]+)$/);
  if (method === "GET" && crmMatch) {
    const customer = company.customers.find((item) => item.id === crmMatch[1]);
    if (!customer) return sendHtml(res, layout("Not found", notFoundPage()), 404);
    return sendHtml(res, layout(customer.name, customerDetailPage(customer)));
  }

  if (method === "POST" && path === "/operations") {
    const fields = await readForm(req);
    const invoice = {
      customer: fields.get("customer")?.trim() ?? "",
      invoiceNumber: fields.get("invoiceNumber")?.trim() ?? "",
      invoiceDate: fields.get("invoiceDate")?.trim() ?? "",
      amount: fields.get("amount")?.trim() ?? "",
      lineItems: fields.get("lineItems")?.trim() ?? "",
    };
    const missing = Object.entries(invoice)
      .filter(([, value]) => value.length === 0)
      .map(([key]) => key);
    if (missing.length > 0) {
      return sendHtml(
        res,
        layout(
          "New invoice",
          invoiceFormPage(invoice, `Missing ${missing.join(", ")}.`),
        ),
        400,
      );
    }
    const pending = company.pendingInvoice;
    if (
      !pending.confirmed &&
      invoice.invoiceNumber === pending.invoiceNumber
    ) {
      return sendHtml(
        res,
        layout(
          "Invoice could not be saved.",
          invoiceFormPage(invoice, pendingBlockedMessage(pending), true),
        ),
        400,
      );
    }
    const saved: SavedInvoice = {
      id: `op-${company.nextInvoiceId++}`,
      ...invoice,
    };
    company.invoices.push(saved);
    return redirect(res, `/operations/${saved.id}`);
  }

  if (method === "POST" && path === "/operations/pending-inv-2048/confirm") {
    const pending = company.pendingInvoice;
    pending.confirmed = true;
    const saved: SavedInvoice = {
      id: `op-${company.nextInvoiceId++}`,
      customer: pending.customer,
      invoiceNumber: pending.invoiceNumber,
      invoiceDate: pending.invoiceDate,
      amount: pending.amount,
      lineItems: pending.lineItems,
    };
    company.invoices.push(saved);
    return redirect(res, `/operations/${saved.id}`);
  }

  const finalMatch = path.match(/^\/operations\/([^/]+)\/final$/);
  if (method === "POST" && finalMatch) {
    const invoice = company.invoices.find((item) => item.id === finalMatch[1]);
    if (!invoice) return sendHtml(res, layout("Not found", notFoundPage()), 404);
    invoice.finalized = true;
    return redirect(res, `/operations/${invoice.id}`);
  }

  const noteMatch = path.match(/^\/support\/([^/]+)\/notes$/);
  if (method === "POST" && noteMatch) {
    const ticket = company.tickets.find((item) => item.id === noteMatch[1]);
    if (!ticket) return sendHtml(res, layout("Not found", notFoundPage()), 404);
    const fields = await readForm(req);
    const note = fields.get("note")?.trim() ?? "";
    if (note.length === 0) {
      return sendHtml(
        res,
        layout(ticket.subject, ticketDetailPage(ticket, "Note is required.")),
        400,
      );
    }
    ticket.notes.push(note);
    return redirect(res, `/support/${ticket.id}`);
  }

  const crmPost = path.match(/^\/crm\/([^/]+)$/);
  if (method === "POST" && crmPost) {
    const customer = company.customers.find((item) => item.id === crmPost[1]);
    if (!customer) return sendHtml(res, layout("Not found", notFoundPage()), 404);
    const fields = await readForm(req);
    const status = fields.get("status")?.trim() ?? "";
    if (status.length === 0) {
      return sendHtml(
        res,
        layout(customer.name, customerDetailPage(customer, "Status is required.")),
        400,
      );
    }
    customer.status = status;
    return redirect(res, `/crm/${customer.id}`);
  }

  sendHtml(res, layout("Not found", notFoundPage()), 404);
}

function homePage(): string {
  return `<h2>Company</h2>
<p>Local records for inbox, operations, support, and CRM.</p>`;
}

function inboxListPage(company: Company): string {
  const items = [...company.inbox]
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .map((message) => {
      const invoice = message.invoiceNumber
        ? ` Invoice number: ${escapeHtml(message.invoiceNumber)}.`
        : "";
      return `<li>
        <a href="/inbox/${escapeHtml(message.id)}">${escapeHtml(message.subject)}</a>
        Received: ${escapeHtml(message.receivedAt)}.
        ${message.customer ? `Customer: ${escapeHtml(message.customer)}.` : "No customer."}
        ${invoice}
      </li>`;
    })
    .join("\n");
  return `<h2>Inbox</h2>
<ul>
${items}
</ul>`;
}

function inboxDetailPage(message: InboxMessage): string {
  const invoice = message.invoiceNumber
    ? `<p>Customer: ${escapeHtml(message.customer)}</p>
<p>Invoice number: ${escapeHtml(message.invoiceNumber)}</p>
<p>Invoice date: ${escapeHtml(message.invoiceDate)}</p>
<p>Amount: ${escapeHtml(message.amount)}</p>
<h3>Line items</h3>
<ul>
${message.lineItems
  .map(
    (item) =>
      `<li>${escapeHtml(item.description)}: ${escapeHtml(item.amount)}</li>`,
  )
  .join("\n")}
</ul>`
    : `<p>${escapeHtml(message.subject)}. This message has no invoice.</p>`;
  return `<h2>${escapeHtml(message.subject)}</h2>
<p>From: ${escapeHtml(message.from)}</p>
<p>Received: ${escapeHtml(message.receivedAt)}</p>
${invoice}
<p><a href="/inbox">Back to inbox</a></p>`;
}

function operationsListPage(company: Company): string {
  const items = company.invoices
    .map(
      (invoice) => `<li>
        <a href="/operations/${escapeHtml(invoice.id)}">${escapeHtml(invoice.invoiceNumber)}</a>
        Customer: ${escapeHtml(invoice.customer)}.
        Invoice date: ${escapeHtml(invoice.invoiceDate)}.
        Amount: ${escapeHtml(invoice.amount)}.
      </li>`,
    )
    .join("\n");
  return `<h2>Operations</h2>
<p><a href="/operations/new">New invoice</a></p>
<ul>
${items}
</ul>`;
}

function pendingBlockedMessage(pending: PendingInvoice): string {
  return `Invoice ${pending.invoiceNumber} has a pending record. Review or update the pending record before saving.`;
}

function invoiceFormPage(
  values: Partial<SavedInvoice> = {},
  error = "",
  blocked = false,
): string {
  const notice = blocked
    ? `<h2>Invoice could not be saved.</h2>
<p role="alert">${escapeHtml(error)}</p>
<p><a href="/operations/pending-inv-2048">Review pending record</a></p>`
    : `<h2>New invoice</h2>
${error ? `<p>${escapeHtml(error)}</p>` : ""}`;
  return `${notice}
<form method="post" action="/operations">
  <p>
    <label for="customer">Customer</label>
    <input id="customer" name="customer" value="${escapeHtml(values.customer ?? "")}">
  </p>
  <p>
    <label for="invoiceNumber">Invoice number</label>
    <input id="invoiceNumber" name="invoiceNumber" value="${escapeHtml(values.invoiceNumber ?? "")}">
  </p>
  <p>
    <label for="invoiceDate">Invoice date</label>
    <input id="invoiceDate" name="invoiceDate" value="${escapeHtml(values.invoiceDate ?? "")}">
  </p>
  <p>
    <label for="amount">Amount</label>
    <input id="amount" name="amount" value="${escapeHtml(values.amount ?? "")}">
  </p>
  <p>
    <label for="lineItems">Line items</label>
    <textarea id="lineItems" name="lineItems">${escapeHtml(values.lineItems ?? "")}</textarea>
  </p>
  <p><button type="submit">Save invoice</button></p>
</form>
<p><a href="/operations">Back to operations</a></p>`;
}

function pendingInvoicePage(pending: PendingInvoice): string {
  return `<h2>${escapeHtml(pending.invoiceNumber)}</h2>
<p>Status: pending</p>
<p>Customer: ${escapeHtml(pending.customer)}</p>
<p>Invoice number: ${escapeHtml(pending.invoiceNumber)}</p>
<p>Invoice date: ${escapeHtml(pending.invoiceDate)}</p>
<p>Amount: ${escapeHtml(pending.amount)}</p>
<p>Line items: ${escapeHtml(pending.lineItems)}</p>
<form method="post" action="/operations/${escapeHtml(pending.id)}/confirm">
  <p><button type="submit">Confirm pending invoice</button></p>
</form>
<p><a href="/operations">Back to operations</a></p>`;
}

function invoiceDetailPage(invoice: SavedInvoice): string {
  const status = invoice.finalized ? "final" : "saved";
  const finalize = invoice.finalized
    ? ""
    : `<form method="post" action="/operations/${escapeHtml(invoice.id)}/final">
  <p><button type="submit">Mark invoice final</button></p>
</form>`;
  return `<h2>${escapeHtml(invoice.invoiceNumber)}</h2>
<p>Status: ${status}</p>
<p>Customer: ${escapeHtml(invoice.customer)}</p>
<p>Invoice number: ${escapeHtml(invoice.invoiceNumber)}</p>
<p>Invoice date: ${escapeHtml(invoice.invoiceDate)}</p>
<p>Amount: ${escapeHtml(invoice.amount)}</p>
<p>Line items: ${escapeHtml(invoice.lineItems)}</p>
${finalize}
<p><a href="/operations">Back to operations</a></p>`;
}

function supportListPage(company: Company): string {
  const items = [...company.tickets]
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .map(
      (ticket) => `<li>
        <a href="/support/${escapeHtml(ticket.id)}">${escapeHtml(ticket.subject)}</a>
        Customer: ${escapeHtml(ticket.customer)}.
        Priority: ${escapeHtml(ticket.priority)}.
        Status: ${escapeHtml(ticket.status)}.
        Opened: ${escapeHtml(ticket.openedAt)}.
      </li>`,
    )
    .join("\n");
  return `<h2>Support</h2>
<ul>
${items}
</ul>`;
}

function ticketDetailPage(ticket: Ticket, error = ""): string {
  const notice = error ? `<p>${escapeHtml(error)}</p>` : "";
  const request = ticket.requestedStatus
    ? `<p>CRM status to set: ${escapeHtml(ticket.requestedStatus)}</p>`
    : "";
  const notes =
    ticket.notes.length === 0
      ? "<p>No notes.</p>"
      : `<ul>
${ticket.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("\n")}
</ul>`;
  return `<h2>${escapeHtml(ticket.subject)}</h2>
<p>Customer: ${escapeHtml(ticket.customer)}</p>
<p>Priority: ${escapeHtml(ticket.priority)}</p>
<p>Status: ${escapeHtml(ticket.status)}</p>
<p>Opened: ${escapeHtml(ticket.openedAt)}</p>
<p>${escapeHtml(ticket.body)}</p>
${request}
<h3>Notes</h3>
${notes}
${notice}
<form method="post" action="/support/${escapeHtml(ticket.id)}/notes">
  <p>
    <label for="note">Note</label>
    <textarea id="note" name="note"></textarea>
  </p>
  <p><button type="submit">Add note</button></p>
</form>
<p><a href="/support">Back to support</a></p>`;
}

function crmListPage(company: Company): string {
  const items = company.customers
    .map(
      (customer) => `<li>
        <a href="/crm/${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</a>
        Status: ${escapeHtml(customer.status)}.
      </li>`,
    )
    .join("\n");
  return `<h2>CRM</h2>
<ul>
${items}
</ul>`;
}

function customerDetailPage(customer: Customer, error = ""): string {
  const notice = error ? `<p>${escapeHtml(error)}</p>` : "";
  return `<h2>${escapeHtml(customer.name)}</h2>
<p>Customer: ${escapeHtml(customer.name)}</p>
<p>Status: ${escapeHtml(customer.status)}</p>
${notice}
<form method="post" action="/crm/${escapeHtml(customer.id)}">
  <p>
    <label for="status">Status</label>
    <input id="status" name="status" value="${escapeHtml(customer.status)}">
  </p>
  <p><button type="submit">Update status</button></p>
</form>
<p><a href="/crm">Back to CRM</a></p>`;
}

function notFoundPage(): string {
  return `<h2>Not found</h2>
<p>That page does not exist.</p>`;
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)} — WorkPilot</title>
  </head>
  <body>
    <h1>WorkPilot</h1>
    <nav>
      <a href="/inbox">Inbox</a>
      <a href="/operations">Operations</a>
      <a href="/support">Support</a>
      <a href="/crm">CRM</a>
    </nav>
    <main>
      ${body}
    </main>
  </body>
</html>`;
}

function normalizePath(url: string): string {
  const path = url.split("?")[0] ?? "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

function sendHtml(res: ServerResponse, html: string, status = 200): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { Location: location });
  res.end();
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
