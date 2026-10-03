import http from "node:http";
import { pathToFileURL } from "node:url";
import { createCompany, handleCompany } from "./company.js";

export function startServer(port = 0,host = "127.0.0.1"): Promise<{ url: string; close: () => Promise<void> }> {
  const company = createCompany();
  const server = http.createServer((req, res) => {
    handleCompany(company, req, res).catch(() => {
      if (res.headersSent) return;
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal error");
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Server did not bind to a TCP port"));
        return;
      }
      resolve({
        url: `http://${host}:${address.port}`,
        close: () => new Promise((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  startServer(3000).then(({ url }) => {
    console.log(url);
  });
}
