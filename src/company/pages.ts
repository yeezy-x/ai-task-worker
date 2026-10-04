import type {
    Company,
    Customer,
    InboxMessage,
    PendingInvoice,
    SavedInvoice,
    Ticket,
  } from "./data.js";
  
  function escapeHtml(value: string | number): string {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  
  function formatAmount(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }
  
  function formatDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  
  function statusClass(status: string): string {
    return status.toLowerCase().replaceAll(" ", "-");
  }
  
  function layout(
    title: string,
    currentPath: string,
    content: string,
  ): string {
    const navItem = (
      href: string,
      label: string,
      icon: string,
    ): string => {
      const active = currentPath === href;
  
      return `
        <a
          class="nav-item ${active ? "active" : ""}"
          href="${href}"
        >
          <span class="nav-icon">${icon}</span>
          <span>${label}</span>
        </a>
      `;
    };
  
    return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0"
    />
    <title>${escapeHtml(title)} · Acme Internal</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  
  <body>
    <div class="app-shell">
  
      <aside class="sidebar">
  
        <div class="brand">
          <div class="brand-mark">A</div>
  
          <div>
            <div class="brand-name">Acme Internal</div>
            <div class="brand-subtitle">Operations Hub</div>
          </div>
        </div>
  
        <nav class="navigation">
  
          <div class="nav-section-title">
            WORKSPACE
          </div>
  
          ${navItem("/inbox", "Inbox", "✉")}
          ${navItem("/operations", "Operations", "▣")}
          ${navItem("/support", "Support", "◉")}
          ${navItem("/crm", "CRM", "♙")}
  
        </nav>
  
        <div class="sidebar-footer">
          <div class="system-status">
            <span class="status-dot"></span>
            <span>All systems operational</span>
          </div>
        </div>
  
      </aside>
  
      <main class="main-content">
  
        <header class="topbar">
  
          <div>
            <div class="breadcrumb">
              Acme Internal
              <span>/</span>
              ${escapeHtml(title)}
            </div>
  
            <h1>${escapeHtml(title)}</h1>
          </div>
  
          <div class="topbar-user">
            <div class="avatar">OP</div>
  
            <div>
              <div class="user-name">Operations</div>
              <div class="user-role">Internal workspace</div>
            </div>
          </div>
  
        </header>
  
        <section class="page-content">
          ${content}
        </section>
  
      </main>
  
    </div>
  </body>
  </html>
  `;
  }
  
  function pageHeader(
    eyebrow: string,
    title: string,
    description: string,
  ): string {
    return `
      <div class="page-header">
  
        <div>
          <div class="eyebrow">${escapeHtml(eyebrow)}</div>
  
          <h2>${escapeHtml(title)}</h2>
  
          <p class="page-description">
            ${escapeHtml(description)}
          </p>
        </div>
  
      </div>
    `;
  }
  
  function emptyState(
    title: string,
    description: string,
  ): string {
    return `
      <div class="empty-state">
        <div class="empty-icon">○</div>
  
        <h3>${escapeHtml(title)}</h3>
  
        <p>${escapeHtml(description)}</p>
      </div>
    `;
  }
  
  export function renderHome(company: Company): string {
    const openTickets = company.tickets.filter(
      (ticket) => ticket.status !== "resolved",
    ).length;
  
    const pendingInvoices = company.pendingInvoices.length;
  
    const activeCustomers = company.customers.filter(
      (customer) => customer.status === "active",
    ).length;
  
    return layout(
      "Overview",
      "/",
      `
        ${pageHeader(
          "WORKSPACE",
          "Overview",
          "Monitor operational activity across the company.",
        )}
  
        <div class="metric-grid">
  
          <div class="metric-card">
            <div class="metric-label">Inbox messages</div>
            <div class="metric-value">${company.inbox.length}</div>
            <div class="metric-meta">Available for review</div>
          </div>
  
          <div class="metric-card">
            <div class="metric-label">Pending invoices</div>
            <div class="metric-value">${pendingInvoices}</div>
            <div class="metric-meta">Require attention</div>
          </div>
  
          <div class="metric-card">
            <div class="metric-label">Open tickets</div>
            <div class="metric-value">${openTickets}</div>
            <div class="metric-meta">Customer issues</div>
          </div>
  
          <div class="metric-card">
            <div class="metric-label">Active customers</div>
            <div class="metric-value">${activeCustomers}</div>
            <div class="metric-meta">CRM accounts</div>
          </div>
  
        </div>
  
        <div class="section-grid">
  
          <div class="panel">
  
            <div class="panel-header">
              <div>
                <div class="panel-title">Recent inbox activity</div>
                <div class="panel-subtitle">
                  Latest messages received
                </div>
              </div>
  
              <a class="panel-link" href="/inbox">
                View inbox
              </a>
            </div>
  
            <div class="record-list">
  
              ${
                company.inbox.length === 0
                  ? emptyState(
                      "Inbox is empty",
                      "There are no messages to review.",
                    )
                  : company.inbox
                      .slice(0, 5)
                      .map((message) => inboxRow(message))
                      .join("")
              }
  
            </div>
  
          </div>
  
          <div class="panel">
  
            <div class="panel-header">
              <div>
                <div class="panel-title">Support activity</div>
                <div class="panel-subtitle">
                  Customer issues requiring attention
                </div>
              </div>
  
              <a class="panel-link" href="/support">
                View support
              </a>
            </div>
  
            <div class="record-list">
  
              ${
                company.tickets.length === 0
                  ? emptyState(
                      "No support tickets",
                      "There are currently no tickets.",
                    )
                  : company.tickets
                      .slice(0, 5)
                      .map((ticket) => ticketRow(ticket))
                      .join("")
              }
  
            </div>
  
          </div>
  
        </div>
      `,
    );
  }
  
  function inboxRow(message: InboxMessage): string {
    return `
      <a
        class="record-row"
        href="/inbox/${encodeURIComponent(message.id)}"
      >
  
        <div class="record-icon email-icon">
          ✉
        </div>
  
        <div class="record-main">
  
          <div class="record-title">
            ${escapeHtml(message.subject)}
          </div>
  
          <div class="record-subtitle">
            ${escapeHtml(message.sender)}
          </div>
  
        </div>
  
        <div class="record-side">
          ${formatDate(message.receivedAt)}
        </div>
  
      </a>
    `;
  }
  
  function ticketRow(ticket: Ticket): string {
    return `
      <a
        class="record-row"
        href="/support/${encodeURIComponent(ticket.id)}"
      >
  
        <div class="record-icon ticket-icon">
          !
        </div>
  
        <div class="record-main">
  
          <div class="record-title">
            ${escapeHtml(ticket.subject)}
          </div>
  
          <div class="record-subtitle">
            ${escapeHtml(ticket.customer)}
          </div>
  
        </div>
  
        <div class="record-side">
  
          <span class="badge ${statusClass(ticket.priority)}">
            ${escapeHtml(ticket.priority)}
          </span>
  
        </div>
  
      </a>
    `;
  }
  
  export function renderInbox(company: Company): string {
    return layout(
      "Inbox",
      "/inbox",
      `
        ${pageHeader(
          "COMMUNICATIONS",
          "Inbox",
          "Review incoming messages and customer documents.",
        )}
  
        <div class="panel">
  
          <div class="panel-header">
  
            <div>
              <div class="panel-title">
                ${company.inbox.length} messages
              </div>
  
              <div class="panel-subtitle">
                Sorted by received date
              </div>
            </div>
  
          </div>
  
          <div class="record-list">
  
            ${
              company.inbox.length === 0
                ? emptyState(
                    "Inbox is empty",
                    "There are no messages to review.",
                  )
                : company.inbox
                    .map((message) => inboxRow(message))
                    .join("")
            }
  
          </div>
  
        </div>
      `,
    );
  }
  
  export function renderInboxMessage(
    message: InboxMessage,
  ): string {
    return layout(
      "Inbox",
      "/inbox",
      `
        <div class="back-link">
          <a href="/inbox">← Back to inbox</a>
        </div>
  
        <div class="detail-layout">
  
          <div class="panel detail-panel">
  
            <div class="detail-header">
  
              <div>
                <div class="eyebrow">MESSAGE</div>
  
                <h2>
                  ${escapeHtml(message.subject)}
                </h2>
              </div>
  
              <div class="detail-date">
                ${formatDate(message.receivedAt)}
              </div>
  
            </div>
  
            <div class="message-meta">
  
              <div class="meta-row">
                <span class="meta-label">From</span>
                <span>${escapeHtml(message.sender)}</span>
              </div>
  
              <div class="meta-row">
                <span class="meta-label">Received</span>
                <span>${formatDate(message.receivedAt)}</span>
              </div>
  
            </div>
  
            <div class="message-body">
              ${escapeHtml(message.body)}
            </div>
  
            ${
              message.invoice
                ? `
                  <div class="embedded-record">
  
                    <div class="embedded-header">
                      <div>
                        <div class="eyebrow">INVOICE</div>
                        <h3>
                          ${escapeHtml(message.invoice.number)}
                        </h3>
                      </div>
  
                      <div class="amount-large">
                        ${formatAmount(message.invoice.amount)}
                      </div>
                    </div>
  
                    <div class="detail-grid">
  
                      <div>
                        <span class="field-label">
                          Invoice date
                        </span>
  
                        <span class="field-value">
                          ${formatDate(message.invoice.invoiceDate)}
                        </span>
                      </div>
  
                      <div>
                        <span class="field-label">
                          Amount
                        </span>
  
                        <span class="field-value">
                          ${formatAmount(message.invoice.amount)}
                        </span>
                      </div>
  
                    </div>
  
                    <div class="line-items">
  
                      <div class="field-label">
                        Line items
                      </div>
  
                      ${message.invoice.lineItems
                        .map(
                          (item) => `
                            <div class="line-item">
                              <span>
                                ${escapeHtml(item.description)}
                              </span>
  
                              <strong>
                                ${formatAmount(item.amount)}
                              </strong>
                            </div>
                          `,
                        )
                        .join("")}
  
                    </div>
  
                  </div>
                `
                : ""
            }
  
          </div>
  
        </div>
      `,
    );
  }
  
  export function renderOperations(
    company: Company,
  ): string {
    return layout(
      "Operations",
      "/operations",
      `
        ${pageHeader(
          "FINANCE",
          "Operations",
          "Manage invoices and operational records.",
        )}
  
        <div class="section-grid">
  
          <div class="panel">
  
            <div class="panel-header">
  
              <div>
                <div class="panel-title">
                  Saved invoices
                </div>
  
                <div class="panel-subtitle">
                  ${company.savedInvoices.length} records
                </div>
              </div>
  
            </div>
  
            <div class="record-list">
  
              ${
                company.savedInvoices.length === 0
                  ? emptyState(
                      "No saved invoices",
                      "Saved operational records will appear here.",
                    )
                  : company.savedInvoices
                      .map((invoice) => invoiceRow(invoice))
                      .join("")
              }
  
            </div>
  
          </div>
  
          <div class="panel">
  
            <div class="panel-header">
  
              <div>
                <div class="panel-title">
                  Pending records
                </div>
  
                <div class="panel-subtitle">
                  Records requiring review
                </div>
              </div>
  
            </div>
  
            <div class="record-list">
  
              ${
                company.pendingInvoices.length === 0
                  ? emptyState(
                      "No pending invoices",
                      "There are no pending records.",
                    )
                  : company.pendingInvoices
                      .map((invoice) => pendingInvoiceRow(invoice))
                      .join("")
              }
  
            </div>
  
          </div>
  
        </div>
  
        <div class="panel form-panel">
  
          <div class="panel-header">
  
            <div>
              <div class="panel-title">
                Enter invoice
              </div>
  
              <div class="panel-subtitle">
                Create a new operational invoice record
              </div>
            </div>
  
          </div>
  
          <form
            class="form"
            method="post"
            action="/operations"
          >
  
            <div class="form-grid">
  
              <div class="form-field">
                <label for="invoiceNumber">
                  Invoice number
                </label>
  
                <input
                  id="invoiceNumber"
                  name="invoiceNumber"
                  type="text"
                  required
                />
              </div>
  
              <div class="form-field">
                <label for="customer">
                  Customer
                </label>
  
                <input
                  id="customer"
                  name="customer"
                  type="text"
                  required
                />
              </div>
  
              <div class="form-field">
                <label for="invoiceDate">
                  Invoice date
                </label>
  
                <input
                  id="invoiceDate"
                  name="invoiceDate"
                  type="date"
                  required
                />
              </div>
  
              <div class="form-field">
                <label for="receivedAt">
                  Received date
                </label>
  
                <input
                  id="receivedAt"
                  name="receivedAt"
                  type="date"
                  required
                />
              </div>
  
              <div class="form-field">
                <label for="amount">
                  Amount
                </label>
  
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                />
              </div>
  
            </div>
  
            <div class="form-actions">
  
              <button
                class="primary-button"
                type="submit"
              >
                Save invoice
              </button>
  
            </div>
  
          </form>
  
        </div>
      `,
    );
  }
  
  function invoiceRow(invoice: SavedInvoice): string {
    return `
      <a
        class="record-row"
        href="/operations/${encodeURIComponent(invoice.id)}"
      >
  
        <div class="record-icon invoice-icon">
          $
        </div>
  
        <div class="record-main">
  
          <div class="record-title">
            ${escapeHtml(invoice.invoiceNumber)}
          </div>
  
          <div class="record-subtitle">
            ${escapeHtml(invoice.customer)}
          </div>
  
        </div>
  
        <div class="record-side">
  
          <div class="record-amount">
            ${formatAmount(invoice.amount)}
          </div>
  
          <span class="badge ${statusClass(invoice.status)}">
            ${escapeHtml(invoice.status)}
          </span>
  
        </div>
  
      </a>
    `;
  }
  
  function pendingInvoiceRow(
    invoice: PendingInvoice,
  ): string {
    return `
      <a
        class="record-row"
        href="/operations/pending/${encodeURIComponent(invoice.id)}"
      >
  
        <div class="record-icon warning-icon">
          !
        </div>
  
        <div class="record-main">
  
          <div class="record-title">
            ${escapeHtml(invoice.invoiceNumber)}
          </div>
  
          <div class="record-subtitle">
            ${escapeHtml(invoice.customer)}
          </div>
  
        </div>
  
        <div class="record-side">
  
          <div class="record-amount">
            ${formatAmount(invoice.amount)}
          </div>
  
          <span class="badge pending">
            Pending
          </span>
  
        </div>
  
      </a>
    `;
  }
  
  export function renderPendingInvoice(
    invoice: PendingInvoice,
  ): string {
    return layout(
      "Pending Invoice",
      "/operations",
      `
        <div class="back-link">
          <a href="/operations">
            ← Back to operations
          </a>
        </div>
  
        <div class="panel detail-panel">
  
          <div class="detail-header">
  
            <div>
              <div class="eyebrow">PENDING RECORD</div>
  
              <h2>
                ${escapeHtml(invoice.invoiceNumber)}
              </h2>
  
              <p class="page-description">
                This invoice requires review before it can be saved.
              </p>
            </div>
  
            <span class="badge pending">
              Pending
            </span>
  
          </div>
  
          <div class="detail-grid">
  
            <div>
              <span class="field-label">Customer</span>
              <span class="field-value">
                ${escapeHtml(invoice.customer)}
              </span>
            </div>
  
            <div>
              <span class="field-label">Invoice date</span>
              <span class="field-value">
                ${formatDate(invoice.invoiceDate)}
              </span>
            </div>
  
            <div>
              <span class="field-label">Received</span>
              <span class="field-value">
                ${formatDate(invoice.receivedAt)}
              </span>
            </div>
  
            <div>
              <span class="field-label">Amount</span>
              <span class="field-value">
                ${formatAmount(invoice.amount)}
              </span>
            </div>
  
          </div>
  
          <div class="form-actions">
  
            <form
              method="post"
              action="/operations/pending/${encodeURIComponent(invoice.id)}/confirm"
            >
              <button
                class="primary-button"
                type="submit"
              >
                Confirm pending invoice
              </button>
            </form>
  
          </div>
  
        </div>
      `,
    );
  }
  
  export function renderSupport(
    company: Company,
  ): string {
    return layout(
      "Support",
      "/support",
      `
        ${pageHeader(
          "CUSTOMER SUCCESS",
          "Support",
          "Review and manage customer support requests.",
        )}
  
        <div class="panel">
  
          <div class="panel-header">
  
            <div>
              <div class="panel-title">
                Support tickets
              </div>
  
              <div class="panel-subtitle">
                ${company.tickets.length} total tickets
              </div>
            </div>
  
          </div>
  
          <div class="record-list">
  
            ${
              company.tickets.length === 0
                ? emptyState(
                    "No tickets",
                    "There are currently no support tickets.",
                  )
                : company.tickets
                    .map((ticket) => supportTicketRow(ticket))
                    .join("")
            }
  
          </div>
  
        </div>
      `,
    );
  }
  
  function supportTicketRow(ticket: Ticket): string {
    return `
      <a
        class="record-row"
        href="/support/${encodeURIComponent(ticket.id)}"
      >
  
        <div class="record-icon ticket-icon">
          !
        </div>
  
        <div class="record-main">
  
          <div class="record-title">
            ${escapeHtml(ticket.subject)}
          </div>
  
          <div class="record-subtitle">
            ${escapeHtml(ticket.customer)}
            ·
            ${formatDate(ticket.createdAt)}
          </div>
  
        </div>
  
        <div class="record-side">
  
          <span class="badge ${statusClass(ticket.priority)}">
            ${escapeHtml(ticket.priority)}
          </span>
  
          <span class="badge ${statusClass(ticket.status)}">
            ${escapeHtml(ticket.status)}
          </span>
  
        </div>
  
      </a>
    `;
  }
  
  export function renderTicket(
    ticket: Ticket,
  ): string {
    return layout(
      "Support Ticket",
      "/support",
      `
        <div class="back-link">
          <a href="/support">
            ← Back to support
          </a>
        </div>
  
        <div class="detail-layout">
  
          <div class="panel detail-panel">
  
            <div class="detail-header">
  
              <div>
                <div class="eyebrow">
                  SUPPORT TICKET
                </div>
  
                <h2>
                  ${escapeHtml(ticket.subject)}
                </h2>
  
                <p class="page-description">
                  ${escapeHtml(ticket.description)}
                </p>
              </div>
  
              <div class="badge-stack">
  
                <span class="badge ${statusClass(ticket.priority)}">
                  ${escapeHtml(ticket.priority)}
                </span>
  
                <span class="badge ${statusClass(ticket.status)}">
                  ${escapeHtml(ticket.status)}
                </span>
  
              </div>
  
            </div>
  
            <div class="detail-grid">
  
              <div>
                <span class="field-label">Customer</span>
  
                <span class="field-value">
                  ${escapeHtml(ticket.customer)}
                </span>
              </div>
  
              <div>
                <span class="field-label">Created</span>
  
                <span class="field-value">
                  ${formatDate(ticket.createdAt)}
                </span>
              </div>
  
            </div>
  
            <div class="notes-section">
  
              <div class="panel-title">
                Notes
              </div>
  
              ${
                ticket.notes.length === 0
                  ? `
                    <div class="notes-empty">
                      No notes have been added.
                    </div>
                  `
                  : ticket.notes
                      .map(
                        (note) => `
                          <div class="note">
                            ${escapeHtml(note)}
                          </div>
                        `,
                      )
                      .join("")
              }
  
            </div>
  
            <form
              class="form"
              method="post"
              action="/support/${encodeURIComponent(ticket.id)}"
            >
  
              <div class="form-field">
  
                <label for="note">
                  Add note
                </label>
  
                <textarea
                  id="note"
                  name="note"
                  rows="4"
                  required
                ></textarea>
  
              </div>
  
              <div class="form-actions">
  
                <button
                  class="primary-button"
                  type="submit"
                >
                  Add note
                </button>
  
              </div>
  
            </form>
  
          </div>
  
        </div>
      `,
    );
  }
  
  export function renderCRM(
    company: Company,
  ): string {
    return layout(
      "CRM",
      "/crm",
      `
        ${pageHeader(
          "CUSTOMER MANAGEMENT",
          "CRM",
          "View customer accounts and relationship information.",
        )}
  
        <div class="panel">
  
          <div class="panel-header">
  
            <div>
              <div class="panel-title">
                Customers
              </div>
  
              <div class="panel-subtitle">
                ${company.customers.length} customer accounts
              </div>
            </div>
  
          </div>
  
          <div class="record-list">
  
            ${
              company.customers.length === 0
                ? emptyState(
                    "No customers",
                    "There are no customer accounts.",
                  )
                : company.customers
                    .map((customer) => customerRow(customer))
                    .join("")
            }
  
          </div>
  
        </div>
      `,
    );
  }
  
  function customerRow(customer: Customer): string {
    return `
      <a
        class="record-row"
        href="/crm/${encodeURIComponent(customer.id)}"
      >
  
        <div class="record-icon customer-icon">
          ${escapeHtml(customer.name.charAt(0))}
        </div>
  
        <div class="record-main">
  
          <div class="record-title">
            ${escapeHtml(customer.company)}
          </div>
  
          <div class="record-subtitle">
            ${escapeHtml(customer.email)}
          </div>
  
        </div>
  
        <div class="record-side">
  
          <span class="badge ${statusClass(customer.status)}">
            ${escapeHtml(customer.status)}
          </span>
  
        </div>
  
      </a>
    `;
  }
  
  export function renderCustomer(
    customer: Customer,
  ): string {
    return layout(
      "CRM Customer",
      "/crm",
      `
        <div class="back-link">
          <a href="/crm">
            ← Back to CRM
          </a>
        </div>
  
        <div class="panel detail-panel">
  
          <div class="detail-header">
  
            <div>
              <div class="eyebrow">
                CUSTOMER ACCOUNT
              </div>
  
              <h2>
                ${escapeHtml(customer.company)}
              </h2>
  
              <p class="page-description">
                ${escapeHtml(customer.name)}
              </p>
            </div>
  
            <span class="badge ${statusClass(customer.status)}">
              ${escapeHtml(customer.status)}
            </span>
  
          </div>
  
          <div class="detail-grid">
  
            <div>
              <span class="field-label">Contact</span>
  
              <span class="field-value">
                ${escapeHtml(customer.name)}
              </span>
            </div>
  
            <div>
              <span class="field-label">Email</span>
  
              <span class="field-value">
                ${escapeHtml(customer.email)}
              </span>
            </div>
  
            <div>
              <span class="field-label">Company</span>
  
              <span class="field-value">
                ${escapeHtml(customer.company)}
              </span>
            </div>
  
            <div>
              <span class="field-label">Status</span>
  
              <span class="field-value">
                ${escapeHtml(customer.status)}
              </span>
            </div>
  
          </div>
  
          <form
            class="form"
            method="post"
            action="/crm/${encodeURIComponent(customer.id)}"
          >
  
            <div class="form-field">
  
              <label for="status">
                Update status
              </label>
  
              <select
                id="status"
                name="status"
              >
                <option
                  value="active"
                  ${customer.status === "active" ? "selected" : ""}
                >
                  Active
                </option>
  
                <option
                  value="inactive"
                  ${customer.status === "inactive" ? "selected" : ""}
                >
                  Inactive
                </option>

                <option value="Under Review" 
                    ${customer.status === "Under Review" ? "selected" : ""}>
                    Under Review
                </option>
              </select>
  
            </div>
  
            <div class="form-field">
  
              <label for="note">
                Add review note
              </label>
  
              <textarea
                id="note"
                name="note"
                rows="4"
                placeholder="Add a note about this customer..."
              ></textarea>
  
            </div>
  
            <div class="form-actions">
  
              <button
                class="primary-button"
                type="submit"
              >
                Update customer
              </button>
  
            </div>
  
          </form>
  
        </div>
      `,
    );
  }