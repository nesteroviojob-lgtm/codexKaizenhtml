import { telegramCall } from "./telegram.mjs";
import { SetupError, requestSetupError } from "./setup-errors.mjs";

export const commands = [
  { command: "start", description: "Услуги и кейсы KAIZEN" },
  { command: "project", description: "Обсудить разработку" },
];

function validateSettings(env, webhook = false) {
  const clean = (value) => (typeof value === "string" ? value.trim() : "");
  const token = clean(env.HTML_BOT_TOKEN);
  const username = clean(env.HTML_BOT_USERNAME).replace(/^@/, "");
  const codes = [];
  if (!token) codes.push("HTML_BOT_TOKEN_MISSING");
  else if (!/^\d+:[A-Za-z0-9_-]+$/.test(token))
    codes.push("HTML_BOT_TOKEN_INVALID");
  if (!username) codes.push("HTML_BOT_USERNAME_MISSING");
  else if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username))
    codes.push("HTML_BOT_USERNAME_INVALID");
  let url;
  const secret = env.HTML_WEBHOOK_SECRET;
  if (webhook) {
    if (!clean(env.HTML_PUBLIC_URL)) codes.push("HTML_PUBLIC_URL_MISSING");
    else {
      try {
        url = new URL(clean(env.HTML_PUBLIC_URL));
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        )
          codes.push("HTML_PUBLIC_URL_INVALID");
      } catch {
        codes.push("HTML_PUBLIC_URL_INVALID");
      }
    }
    if (!secret) codes.push("HTML_WEBHOOK_SECRET_MISSING");
    else if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret))
      codes.push("HTML_WEBHOOK_SECRET_INVALID");
  }
  if (codes.length) throw new SetupError(codes);
  return { token, username, url, secret };
}

export async function verifyBot({ env = process.env, call } = {}) {
  const { token, username } = validateSettings(env);
  const send =
    call || ((method, payload) => telegramCall(token, method, payload));
  const request = async (method, payload) => {
    try {
      return await send(method, payload);
    } catch (error) {
      throw requestSetupError(error, method);
    }
  };
  const me = await request("getMe", {});
  if (!me?.is_bot || me.username?.toLowerCase() !== username.toLowerCase())
    throw new SetupError("BOT_IDENTITY_MISMATCH");
  return request;
}

export async function configureBot({ env = process.env, call } = {}) {
  const { url, secret } = validateSettings(env, true);
  const request = await verifyBot({ env, call });
  const webhookUrl = `${url.origin}/api/telegram`;
  const current = await request("getWebhookInfo", {});
  if (current.url && current.url !== webhookUrl)
    throw new SetupError("EXISTING_WEBHOOK");
  await request("setMyCommands", { commands });
  await request("setChatMenuButton", { menu_button: { type: "commands" } });
  await request("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "widget_query"],
    drop_pending_updates: false,
  });
  return { configured: true };
}
