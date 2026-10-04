import { company, createInvoice } from "./company.js";

const esc = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const layout = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title} | WorkPilot Company</title><style>body{font:15px system-ui;margin:0;color:#172033;background:#f6f7fb}nav{padding:16px 8%;background:#18243c}nav a{color:#fff;margin-right:20px;text-decoration:none}main{max-width:900px;margin:32px auto;background:#fff;padding:28px;border-radius:10px}article{border:1px solid #d7dce8;padding:16px;margin:12px 0;border-radius:8px}label{display:block;margin-top:12px;font-weight:600}input,textarea,select,button{font:inherit;padding:8px;margin-top:5px}textarea{min-width:410px;height:55px}button{cursor:pointer;background:#2457d6;color:#fff;border:0;border-radius:5px}.meta{color:#57657b}.high{color:#a20e19;font-weight:700}.error{color:#a20e19;font-weight:700}</style></head><body><nav><a href="/inbox">Inbox</a><a href="/crm">CRM</a><a href="/support">Support</a><a href="/operations">Operations</a></nav><main><h1>${title}</h1>${body}</main></body></html>`;

export const home = () => layout("Company workspace", "<p>Use the company applications above. This local workspace is the only environment available to WorkPilot.</p>");
export const inbox = () => layout("Inbox", company().messages.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).map((message) => `<article data-testid="message-${message.id}"><a href="/inbox/${message.id}" data-testid="open-message-${message.id}"><strong>${esc(message.subject)}</strong></a><p>${esc(message.from)} · ${new Date(message.receivedAt).toLocaleString()}</p></article>`).join(""));
export const message = (id: string) => {
  const item = company().messages.find((entry) => entry.id === id);
  return item ? layout("Message", `<article data-testid="message-detail"><p><strong>From:</strong> ${esc(item.from)}</p><p><strong>Subject:</strong> ${esc(item.subject)}</p><p><strong>Received:</strong> ${item.receivedAt}</p><p>${esc(item.body)}</p></article>`) : layout("Message not found", "<p>Not found.</p>");
};
export const crm = () => layout("CRM", company().customers.map((customer) => `<article data-testid="customer-${customer.id}"><h2>${esc(customer.name)}</h2><p data-testid="crm-status-${customer.id}"><strong>Current status:</strong> ${esc(customer.status)}</p><p><strong>Latest support request:</strong> ${esc(customer.latestSupportRequest || "None")}</p><form method="post" action="/crm/${customer.id}/status"><label>Status <select name="status" data-testid="crm-status-select-${customer.id}"><option ${customer.status === "Active" ? "selected" : ""}>Active</option><option ${customer.status === "Needs follow-up" ? "selected" : ""}>Needs follow-up</option><option ${customer.status === "Escalated" ? "selected" : ""}>Escalated</option></select></label><button data-testid="save-crm-${customer.id}">Save status</button></form></article>`).join(""));
export const support = () => layout("Support", company().tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((ticket) => `<article data-testid="ticket-${ticket.id}"><h2>${esc(ticket.id)} — ${esc(ticket.subject)}</h2><p><strong>Customer:</strong> ${esc(ticket.customer)} · <span class="${ticket.priority === "high" ? "high" : ""}">Priority: ${ticket.priority}</span> · Status: ${ticket.status}</p><p data-testid="ticket-note-${ticket.id}"><strong>Internal note:</strong> ${esc(ticket.note || "None")}</p><form method="post" action="/support/${ticket.id}/note"><label>Internal note <textarea name="note" data-testid="ticket-note-input-${ticket.id}">${esc(ticket.note)}</textarea></label><button data-testid="save-note-${ticket.id}">Save note</button></form></article>`).join(""));
export const operations = (error = "") => layout("Operations", `${error ? `<p class="error" data-testid="operations-error">${esc(error)}</p>` : ""}<article><h2>Process invoice</h2><form method="post" action="/operations/invoices"><label>Reference <input name="reference" data-testid="invoice-reference"></label><label>Customer <input name="customer" data-testid="invoice-customer"></label><label>Amount <input name="amount" data-testid="invoice-amount"></label><label>Source message ID <input name="sourceMessageId" data-testid="invoice-source-message"></label><button data-testid="save-invoice">Process invoice</button></form></article><h2>Processed invoices</h2>${company().invoices.filter((invoice) => invoice.state === "processed").map((invoice) => `<article data-testid="invoice-${invoice.reference}"><strong>${esc(invoice.reference)}</strong><p>${esc(invoice.customer)} · ${esc(invoice.amount)} · source: ${esc(invoice.sourceMessageId)}</p></article>`).join("") || "<p data-testid=\"no-processed-invoices\">No processed invoices.</p>"}`);

export function performForm(path: string, fields: Record<string, string>) {
  if (path.startsWith("/crm/") && path.endsWith("/status")) {
    const customer = company().customers.find((entry) => entry.id === path.split("/")[2]);
    if (!customer || !["Active", "Needs follow-up", "Escalated"].includes(fields.status)) return { redirect: "/crm" };
    customer.status = fields.status;
    return { redirect: "/crm" };
  }
  if (path.startsWith("/support/") && path.endsWith("/note")) {
    const ticket = company().tickets.find((entry) => entry.id === path.split("/")[2]);
    if (ticket) ticket.note = fields.note ?? "";
    return { redirect: "/support" };
  }
  if (path === "/operations/invoices") {
    const result = createInvoice({ reference: fields.reference ?? "", customer: fields.customer ?? "", amount: fields.amount ?? "", sourceMessageId: fields.sourceMessageId ?? "" });
    if (!result.ok) return { redirect: `/operations?error=${encodeURIComponent(`${result.code}: ${result.message}`)}` };
    return { redirect: "/operations" };
  }
  return { redirect: "/" };
}
