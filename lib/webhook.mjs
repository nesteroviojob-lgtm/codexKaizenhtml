import { timingSafeEqual } from "node:crypto";
import { createBotHandler } from "./bot.mjs";
import { readJson, json, BodyError } from "./http.mjs";

export function createWebhookHandler({ env = process.env, call, now } = {}) {
  const handle = createBotHandler({ env, call, now });
  return async (req, res) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      json(res, 405, { error: "POST required" });
      return;
    }
    const secret = env.HTML_WEBHOOK_SECRET;
    if (!env.HTML_BOT_TOKEN || !/^[A-Za-z0-9_-]{32,256}$/.test(secret || "")) {
      json(res, 503, { error: "Bot not configured" });
      return;
    }
    const supplied = req.headers["x-telegram-bot-api-secret-token"];
    if (
      typeof supplied !== "string" ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(secret) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
    ) {
      json(res, 403, { error: "Forbidden" });
      return;
    }
    if (
      !/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")
    ) {
      json(res, 415, { error: "JSON required" });
      return;
    }
    let update;
    try {
      update = await readJson(req);
    } catch (error) {
      json(res, error instanceof BodyError ? error.status : 400, {
        error: "Invalid body",
      });
      return;
    }
    if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) {
      json(res, 400, { error: "Invalid update" });
      return;
    }
    try {
      await handle(update);
      json(res, 200, { ok: true });
    } catch {
      json(res, 502, {
        error: "Telegram delivery unconfirmed; update may be retried",
      });
    }
  };
}
