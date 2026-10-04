export type Customer = { id: string; name: string; status: string; latestSupportRequest: string };
export type Ticket = { id: string; customer: string; subject: string; priority: "high" | "normal"; status: "open" | "resolved"; note: string; createdAt: string };
export type Invoice = { id: string; reference: string; customer: string; amount: string; sourceMessageId: string; state: "processed" | "archived" };
export type Message = { id: string; from: string; subject: string; receivedAt: string; body: string };

const seed = () => ({
  messages: [
    { id: "msg-acme-104", from: "billing@acme.example", subject: "Invoice ACME-104 — September services", receivedAt: "2026-10-03T09:30:00Z", body: "Please process our latest invoice. Reference: ACME-104. Customer: Acme Corporation. Amount: $2,450.00." },
    { id: "msg-acme-103", from: "billing@acme.example", subject: "Invoice ACME-103 — August services", receivedAt: "2026-09-03T09:30:00Z", body: "Reference: ACME-103. Customer: Acme Corporation. Amount: $1,980.00." },
    { id: "msg-globex-19", from: "billing@globex.example", subject: "Invoice GLOBEX-19", receivedAt: "2026-10-02T11:00:00Z", body: "Reference: GLOBEX-19. Amount: $720.00." }
  ] as Message[],
  customers: [
    { id: "cust-acme", name: "Acme Corporation", status: "Active", latestSupportRequest: "Cannot export the quarterly report; please follow up." },
    { id: "cust-globex", name: "Globex", status: "Active", latestSupportRequest: "" }
  ] as Customer[],
  tickets: [
    { id: "SUP-401", customer: "Acme Corporation", subject: "Quarterly report export fails", priority: "high", status: "open", note: "", createdAt: "2026-10-03T13:00:00Z" },
    { id: "SUP-397", customer: "Acme Corporation", subject: "SSO invite error", priority: "high", status: "open", note: "", createdAt: "2026-10-01T10:00:00Z" },
    { id: "SUP-390", customer: "Acme Corporation", subject: "Update billing contact", priority: "normal", status: "resolved", note: "", createdAt: "2026-09-29T08:00:00Z" },
    { id: "SUP-399", customer: "Globex", subject: "Dashboard question", priority: "normal", status: "open", note: "", createdAt: "2026-10-02T08:00:00Z" }
  ] as Ticket[],
  // This archived reference deliberately produces the controlled duplicate failure.
  invoices: [{ id: "inv-archived-acme-104", reference: "ACME-104", customer: "Acme Corporation", amount: "$2,450.00", sourceMessageId: "historic-import", state: "archived" }] as Invoice[]
});

let data = seed();
export const resetCompany = () => { data = seed(); };
export const company = () => data;

export function createInvoice(input: Pick<Invoice, "reference" | "customer" | "amount" | "sourceMessageId">) {
  if (data.invoices.some((invoice) => invoice.reference === input.reference)) {
    return { ok: false as const, code: "DUPLICATE_REFERENCE", message: `Reference ${input.reference} already exists in an archived import. Use ${input.reference}-REV1 for this corrected current invoice.`, suggestedReference: `${input.reference}-REV1` };
  }
  const invoice = { id: `inv-${Date.now()}`, ...input, state: "processed" as const };
  data.invoices.push(invoice);
  return { ok: true as const, invoice };
}
