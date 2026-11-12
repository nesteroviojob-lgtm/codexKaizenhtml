import { leadsReady } from "../lib/brief.mjs";
import { json } from "../lib/http.mjs";
export default function health(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    json(res, 405, { error: "GET required" });
    return;
  }
  json(res, 200, {
    ok: true,
    product: "kaizen-html-bot",
    configured: Boolean(
      process.env.HTML_BOT_TOKEN && process.env.HTML_WEBHOOK_SECRET,
    ),
    leadsConfigured: leadsReady(process.env),
  });
}
