import type { IncomingMessage, ServerResponse } from "node:http";

import type { Company } from "./data.js";

import {
  renderCRM,
  renderCustomer,
  renderHome,
  renderInbox,
  renderInboxMessage,
  renderOperations,
  renderPendingInvoice,
  renderSupport,
  renderTicket,
} from "./pages.js";

function sendHtml(
  res: ServerResponse,
  html: string,
  statusCode = 200,
): void {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
  });

  res.end(html);
}

function sendText(
  res: ServerResponse,
  text: string,
  statusCode = 200,
): void {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });

  res.end(text);
}

function redirect(
  res: ServerResponse,
  location: string,
): void {
  res.writeHead(302, {
    Location: location,
  });

  res.end();
}

function notFound(res: ServerResponse): void {
  sendText(res, "Not found", 404);
}

function methodNotAllowed(res: ServerResponse): void {
  sendText(res, "Method not allowed", 405);
}

function parseFormBody(
  req: IncomingMessage,
): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      const params = new URLSearchParams(body);

      const result: Record<string, string> = {};

      for (const [key, value] of params.entries()) {
        result[key] = value;
      }

      resolve(result);
    });

    req.on("error", reject);
  });
}

function getPathSegments(
  requestUrl: string,
): string[] {
  const url = new URL(
    requestUrl,
    "http://localhost",
  );

  return url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      decodeURIComponent(segment),
    );
}

export async function handleCompanyRequest(
  company: Company,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    notFound(res);
    return;
  }

  const method = req.method ?? "GET";
  const segments = getPathSegments(req.url);

  /*
   * --------------------------------------------------
   * Static company stylesheet
   * --------------------------------------------------
   */

  if (
    segments.length === 1 &&
    segments[0] === "styles.css" &&
    method === "GET"
  ) {
    sendText(
      res,
      "Company stylesheet is served by the company server.",
    );

    return;
  }

  /*
   * --------------------------------------------------
   * Home
   * GET /
   * --------------------------------------------------
   */

  if (segments.length === 0) {
    if (method !== "GET") {
      methodNotAllowed(res);
      return;
    }

    sendHtml(res, renderHome(company));
    return;
  }

  /*
   * --------------------------------------------------
   * Inbox
   * GET /inbox
   * GET /inbox/:messageId
   * --------------------------------------------------
   */

  if (segments[0] === "inbox") {
    if (method !== "GET") {
      methodNotAllowed(res);
      return;
    }

    if (segments.length === 1) {
      sendHtml(res, renderInbox(company));
      return;
    }

    if (segments.length === 2) {
      const messageId = segments[1];

      const message = company.inbox.find(
        (item) => item.id === messageId,
      );

      if (!message) {
        notFound(res);
        return;
      }

      sendHtml(
        res,
        renderInboxMessage(message),
      );

      return;
    }

    notFound(res);
    return;
  }

  /*
   * --------------------------------------------------
   * Operations
   * --------------------------------------------------
   *
   * GET  /operations
   * POST /operations
   *
   * GET  /operations/pending/:id
   * POST /operations/pending/:id/confirm
   *
   * GET  /operations/:id
   */

  if (segments[0] === "operations") {
    /*
     * Operations home
     */

    if (segments.length === 1) {
      if (method === "GET") {
        sendHtml(
          res,
          renderOperations(company),
        );

        return;
      }

      if (method === "POST") {
        const body = await parseFormBody(req);

        const invoiceNumber =
          body.invoiceNumber?.trim();

        const customer =
          body.customer?.trim();

        const invoiceDate =
          body.invoiceDate?.trim();

        const receivedAt =
          body.receivedAt?.trim();

        const amount =
          Number(body.amount);

        if (
          !invoiceNumber ||
          !customer ||
          !invoiceDate ||
          !receivedAt ||
          !Number.isFinite(amount)
        ) {
          sendText(
            res,
            "Invalid invoice data",
            400,
          );

          return;
        }

        /*
         * Business rule:
         *
         * If this invoice already has a pending
         * record, the company does not allow
         * it to be saved directly.
         *
         * The agent must discover this through
         * the browser and decide how to recover.
         */

        const pendingInvoice =
          company.pendingInvoices.find(
            (invoice) =>
              invoice.invoiceNumber ===
              invoiceNumber,
          );

        if (pendingInvoice) {
          sendHtml(
            res,
            `
              <html>
                <body>
                  <h1>Invoice could not be saved.</h1>

                  <p>
                    Invoice ${invoiceNumber}
                    has a pending record.
                  </p>

                  <p>
                    Review or update the pending
                    record before saving.
                  </p>

                  <a
                    href="/operations/pending/${encodeURIComponent(
                      pendingInvoice.id,
                    )}"
                  >
                    Review pending record
                  </a>
                </body>
              </html>
            `,
            409,
          );

          return;
        }

        const savedInvoice = {
          id: `op-${company.savedInvoices.length + 1}`,
          invoiceNumber,
          customer,
          invoiceDate,
          receivedAt,
          amount,
          lineItems: [],
          status: "saved" as const,
        };

        company.savedInvoices.push(
          savedInvoice,
        );

        redirect(res, "/operations");
        return;
      }

      methodNotAllowed(res);
      return;
    }

    /*
     * Pending invoice
     *
     * GET
     * /operations/pending/:id
     */

    if (
      segments.length === 3 &&
      segments[1] === "pending"
    ) {
      if (method !== "GET") {
        methodNotAllowed(res);
        return;
      }

      const pendingId = segments[2];

      const pendingInvoice =
        company.pendingInvoices.find(
          (invoice) =>
            invoice.id === pendingId,
        );

      if (!pendingInvoice) {
        notFound(res);
        return;
      }

      sendHtml(
        res,
        renderPendingInvoice(
          pendingInvoice,
        ),
      );

      return;
    }

    /*
     * Confirm pending invoice
     *
     * POST
     * /operations/pending/:id/confirm
     */

    if (
      segments.length === 4 &&
      segments[1] === "pending" &&
      segments[3] === "confirm"
    ) {
      if (method !== "POST") {
        methodNotAllowed(res);
        return;
      }

      const pendingId = segments[2];

      const pendingIndex =
        company.pendingInvoices.findIndex(
          (invoice) =>
            invoice.id === pendingId,
        );

      if (pendingIndex === -1) {
        notFound(res);
        return;
      }

      const pendingInvoice =
        company.pendingInvoices[
          pendingIndex
        ];

      company.savedInvoices.push({
        id: `op-${company.savedInvoices.length + 1}`,
        invoiceNumber:
          pendingInvoice.invoiceNumber,
        customer:
          pendingInvoice.customer,
        invoiceDate:
          pendingInvoice.invoiceDate,
        receivedAt:
          pendingInvoice.receivedAt,
        amount:
          pendingInvoice.amount,
        lineItems:
          pendingInvoice.lineItems,
        status: "saved",
      });

      company.pendingInvoices.splice(
        pendingIndex,
        1,
      );

      redirect(res, "/operations");

      return;
    }

    /*
     * Saved invoice detail
     *
     * GET /operations/:id
     */

    if (segments.length === 2) {
      if (method !== "GET") {
        methodNotAllowed(res);
        return;
      }

      const invoiceId = segments[1];

      const invoice =
        company.savedInvoices.find(
          (item) => item.id === invoiceId,
        );

      if (!invoice) {
        notFound(res);
        return;
      }

      sendHtml(
        res,
        `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Invoice ${invoice.invoiceNumber}</title>
              <link
                rel="stylesheet"
                href="/styles.css"
              />
            </head>

            <body>
              <div class="app-shell">

                <main
                  class="main-content"
                  style="margin-left: 0; width: 100%;"
                >

                  <section
                    class="page-content"
                  >

                    <div class="back-link">
                      <a href="/operations">
                        ← Back to operations
                      </a>
                    </div>

                    <div
                      class="panel detail-panel"
                    >

                      <div
                        class="detail-header"
                      >

                        <div>
                          <div class="eyebrow">
                            SAVED INVOICE
                          </div>

                          <h2>
                            ${invoice.invoiceNumber}
                          </h2>
                        </div>

                        <span
                          class="badge ${invoice.status}"
                        >
                          ${invoice.status}
                        </span>

                      </div>

                      <div class="detail-grid">

                        <div>
                          <span class="field-label">
                            Customer
                          </span>

                          <span class="field-value">
                            ${invoice.customer}
                          </span>
                        </div>

                        <div>
                          <span class="field-label">
                            Invoice date
                          </span>

                          <span class="field-value">
                            ${invoice.invoiceDate}
                          </span>
                        </div>

                        <div>
                          <span class="field-label">
                            Received
                          </span>

                          <span class="field-value">
                            ${invoice.receivedAt}
                          </span>
                        </div>

                        <div>
                          <span class="field-label">
                            Amount
                          </span>

                          <span class="field-value">
                            $${invoice.amount.toFixed(2)}
                          </span>
                        </div>

                      </div>

                    </div>

                  </section>

                </main>

              </div>
            </body>
          </html>
        `,
      );

      return;
    }

    notFound(res);
    return;
  }

  /*
   * --------------------------------------------------
   * Support
   * --------------------------------------------------
   *
   * GET  /support
   * GET  /support/:ticketId
   * POST /support/:ticketId
   */

  if (segments[0] === "support") {
    if (segments.length === 1) {
      if (method !== "GET") {
        methodNotAllowed(res);
        return;
      }

      sendHtml(
        res,
        renderSupport(company),
      );

      return;
    }

    if (segments.length === 2) {
      const ticketId = segments[1];

      const ticket =
        company.tickets.find(
          (item) => item.id === ticketId,
        );

      if (!ticket) {
        notFound(res);
        return;
      }

      if (method === "GET") {
        sendHtml(
          res,
          renderTicket(ticket),
        );

        return;
      }

      if (method === "POST") {
        const body = await parseFormBody(req);

        const note =
          body.note?.trim();

        if (!note) {
          sendText(
            res,
            "Note is required",
            400,
          );

          return;
        }

        ticket.notes.push(note);

        /*
         * The support task can also move
         * an unresolved issue into review.
         */

        if (ticket.status === "open") {
          ticket.status = "in-progress";
        }

        redirect(
          res,
          `/support/${encodeURIComponent(ticket.id)}`,
        );

        return;
      }

      methodNotAllowed(res);
      return;
    }

    notFound(res);
    return;
  }

  /*
   * --------------------------------------------------
   * CRM
   * --------------------------------------------------
   *
   * GET  /crm
   * GET  /crm/:customerId
   * POST /crm/:customerId
   */

  if (segments[0] === "crm") {
    if (segments.length === 1) {
      if (method !== "GET") {
        methodNotAllowed(res);
        return;
      }

      sendHtml(
        res,
        renderCRM(company),
      );

      return;
    }

    if (segments.length === 2) {
      const customerId = segments[1];

      const customer =
        company.customers.find(
          (item) => item.id === customerId,
        );

      if (!customer) {
        notFound(res);
        return;
      }

      if (method === "GET") {
        sendHtml(
          res,
          renderCustomer(customer),
        );

        return;
      }

      if (method === "POST") {
        const body = await parseFormBody(req);

        if (
          body.status === "active" ||
          body.status === "inactive"
        ) {
          customer.status = body.status;
        }

        /*
         * A CRM note is represented by adding
         * a support-style operational note
         * to the customer's display state.
         *
         * For the current prototype we keep
         * the actual customer model minimal.
         */

        redirect(
          res,
          `/crm/${encodeURIComponent(customer.id)}`,
        );

        return;
      }

      methodNotAllowed(res);
      return;
    }

    notFound(res);
    return;
  }

  notFound(res);
}