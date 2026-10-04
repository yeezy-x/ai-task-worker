import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uiDirectory = path.join(__dirname, "ui");

console.log("UI Directory:", uiDirectory);

function serveFile(
  filePath: string,
  contentType: string,
  res: http.ServerResponse
): void {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {
        "Content-Type": "text/plain",
      });

      res.end("Error reading file");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
    });

    res.end(data);
  });
}

export function startServer(): Promise<{
  server: http.Server;
  url: string;
}> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/" && req.method === "GET") {
        serveFile(
          path.join(uiDirectory, "index.html"),
          "text/html",
          res
        );
        return;
      }

      if (req.url === "/index.css" && req.method === "GET") {
        serveFile(
          path.join(uiDirectory, "index.css"),
          "text/css",
          res
        );

        return;
      }

      if (req.url === "/index.js" && req.method === "GET") {
        serveFile(
          path.join(uiDirectory, "index.js"),
          "application/javascript",
          res
        );

        return;
      }

      res.writeHead(404, {
        "Content-Type": "text/plain",
      });

      res.end("Not found");
    });

    server.listen(3000, () => {
      const url = "http://localhost:3000";
      console.log(`WorkPilot server running at ${url}`);
      resolve({server,url});
    });
    server.on("error", reject);
  });
}