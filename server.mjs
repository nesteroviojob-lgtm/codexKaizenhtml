import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createWebhookHandler } from "./lib/webhook.mjs";
import health from "./api/health.mjs";
import { json } from "./lib/http.mjs";

const root = new URL("dist/", import.meta.url);
const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/home.html", ["home.html", "text/html"]],
  ["/brief.html", ["brief.html", "text/html"]],
  ["/preview.css", ["preview.css", "text/css"]],
  ["/preview.js", ["preview.js", "text/javascript"]],
  ["/logo.svg", ["logo.svg", "image/svg+xml"]],
]);
export function createApp({ env = process.env, call } = {}) {
  const webhook = createWebhookHandler({ env, call });
  return createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    );
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/api/telegram") {
      await webhook(req, res);
      return;
    }
    if (path === "/api/health") {
      health(req, res);
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && files.has(path)) {
      const [file, mime] = files.get(path);
      try {
        const data = await readFile(new URL(file, root));
        res.writeHead(200, {
          "Content-Type": `${mime}; charset=utf-8`,
          "Content-Length": data.length,
          "Cache-Control": "no-cache",
        });
        res.end(req.method === "HEAD" ? undefined : data);
      } catch {
        json(res, 503, { error: "Run npm run build" });
      }
      return;
    }
    json(res, 404, { error: "Not found" });
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApp();
  const port = Number(process.env.PORT || 3101);
  app.requestTimeout = 30000;
  app.headersTimeout = 15000;
  app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`KAIZEN HTML preview: http://127.0.0.1:${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => app.close(() => process.exit(0)));
}
