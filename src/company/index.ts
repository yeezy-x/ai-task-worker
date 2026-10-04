import "./../env.js";

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createCompany } from "./data.js";
import { handleCompanyRequest } from "./routes.js";

const DEFAULT_PORT = 3001;

export interface CompanyServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

export async function startCompanyServer(
  requestedPort = DEFAULT_PORT
): Promise<CompanyServer> {
  const company = createCompany();

  const stylesPath = fileURLToPath(
    new URL("./styles.css", import.meta.url)
  );

  const server = createServer(
    async (req, res) => {
      try {
        const url = new URL(
          req.url ?? "/",
          "http://localhost"
        );

        /*
         * Static stylesheet
         */

        if (
          url.pathname === "/styles.css" &&
          req.method === "GET"
        ) {
          const css = await readFile(
            stylesPath,
            "utf8"
          );

          res.writeHead(200, {
            "Content-Type": "text/css; charset=utf-8",
          });

          res.end(css);
          return;
        }

        /*
         * Everything else belongs to the simulated
         * company routes.
         */

        await handleCompanyRequest(
          company,
          req,
          res
        );
      } catch (error) {
        console.error(
          "Company server error:",
          error
        );

        if (!res.headersSent) {
          res.writeHead(500, {
            "Content-Type":
              "text/plain; charset=utf-8",
          });
        }

        res.end("Internal Server Error");
      }
    }
  );

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("error", onError);
      reject(error);
    };

    server.once("error", onError);

    server.listen(
      requestedPort,
      "127.0.0.1",
      () => {
        server.off("error", onError);
        resolve();
      }
    );
  });

  const address = server.address();

  if (
    !address ||
    typeof address === "string"
  ) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    throw new Error(
      "Could not determine company server port."
    );
  }

  const port = address.port;

  return {
    port,
    url: `http://127.0.0.1:${port}`,

    close: async () => {
      await new Promise<void>(
        (resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        }
      );
    },
  };
}

/*
 * Allow this file to be run directly:
 *
 * npm run company
 */

if (
 process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  const server = await startCompanyServer();

  console.log("");
  console.log("Simulated Company");
  console.log("-----------------");
  console.log(`URL: ${server.url}`);
  console.log("");
  console.log(
    "Press Ctrl+C to stop the server."
  );
}