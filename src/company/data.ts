export type LineItem = {
    description: string;
    amount: number;
  };
  
  export type InboxMessage = {
    id: string;
    sender: string;
    subject: string;
    receivedAt: string;
    body: string;
    invoice?: {
      number: string;
      invoiceDate: string;
      amount: number;
      lineItems: LineItem[];
    };
  };
  
  export type SavedInvoice = {
    id: string;
    invoiceNumber: string;
    customer: string;
    invoiceDate: string;
    receivedAt: string;
    amount: number;
    lineItems: LineItem[];
    status: "saved" | "final";
  };
  
  export type PendingInvoice = {
    id: string;
    invoiceNumber: string;
    customer: string;
    invoiceDate: string;
    receivedAt: string;
    amount: number;
    lineItems: LineItem[];
    status: "pending";
  };
  
  export type Ticket = {
    id: string;
    customer: string;
    subject: string;
    description: string;
    priority: "low" | "medium" | "high";
    status: "open" | "in-progress" | "resolved";
    createdAt: string;
    notes: string[];
  };
  
  export type Customer = {
    id: string;
    name: string;
    email: string;
    company: string;
    status: "active" | "inactive" | "Under Review";
  };
  
  export type Company = {
    inbox: InboxMessage[];
    savedInvoices: SavedInvoice[];
    pendingInvoices: PendingInvoice[];
    tickets: Ticket[];
    customers: Customer[];
  };
  
  export function createCompany(): Company {
    return {
      inbox: [
        {
          id: "acme-inv-2048",
          sender: "billing@acme.example",
          subject: "Invoice INV-2048",
          receivedAt: "2026-09-28",
          body: "Please find attached invoice INV-2048 for the latest services.",
          invoice: {
            number: "INV-2048",
            invoiceDate: "2026-09-28",
            amount: 4750,
            lineItems: [
              {
                description: "Platform subscription",
                amount: 3500,
              },
              {
                description: "Implementation",
                amount: 1250,
              },
            ],
          },
        },
        {
          id: "acme-inv-1001",
          sender: "billing@acme.example",
          subject: "Invoice INV-1001",
          receivedAt: "2026-08-28",
          body: "Please find attached invoice INV-1001.",
          invoice: {
            number: "INV-1001",
            invoiceDate: "2026-08-28",
            amount: 3200,
            lineItems: [
              {
                description: "Platform subscription",
                amount: 3200,
              },
            ],
          },
        },
      ],
  
      savedInvoices: [
        {
          id: "op-1",
          invoiceNumber: "INV-1001",
          customer: "Acme",
          invoiceDate: "2026-08-28",
          receivedAt: "2026-08-28",
          amount: 3200,
          lineItems: [
            {
              description: "Platform subscription",
              amount: 3200,
            },
          ],
          status: "final",
        },
      ],
  
      pendingInvoices: [
        {
          id: "pending-1",
          invoiceNumber: "INV-2048",
          customer: "Acme",
          invoiceDate: "2026-09-28",
          receivedAt: "2026-09-28",
          amount: 4750,
          lineItems: [
            {
              description: "Platform subscription",
              amount: 3500,
            },
            {
              description: "Implementation",
              amount: 1250,
            },
          ],
          status: "pending",
        },
      ],
  
      tickets: [
        {
          id: "ticket-101",
          customer: "Acme",
          subject: "API integration issue",
          description:
            "Acme is experiencing intermittent failures with the API integration.",
          priority: "high",
          status: "open",
          createdAt: "2026-09-30",
          notes: [],
        },
        {
          id: "ticket-102",
          customer: "Acme",
          subject: "Dashboard loading slowly",
          description:
            "The customer reports that the dashboard is taking several seconds to load.",
          priority: "medium",
          status: "open",
          createdAt: "2026-09-29",
          notes: [],
        },
        {
          id: "ticket-103",
          customer: "Acme",
          subject: "Authentication failure",
          description:
            "Users are unable to authenticate intermittently.",
          priority: "high",
          status: "resolved",
          createdAt: "2026-09-27",
          notes: [],
        },
      ],
  
      customers: [
        {
          id: "customer-acme",
          name: "Acme Corporation",
          email: "ops@acme.example",
          company: "Acme",
          status: "active",
        },
        {
          id: "customer-globex",
          name: "Globex Corporation",
          email: "ops@globex.example",
          company: "Globex",
          status: "active",
        },
      ],
    };
}