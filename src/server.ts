import http from "node:http";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>WorkPilot</title>
  </head>
  <body>
    <h1>WorkPilot</h1>
  </body>
</html>
`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

server.listen(3000, "127.0.0.1", () => {
  console.log("http://127.0.0.1:3000");
});