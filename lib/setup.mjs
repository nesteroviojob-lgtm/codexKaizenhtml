import { telegramCall } from "./telegram.mjs";

export const commands = [
  { command: "start", description: "Услуги и кейсы KAIZEN" },
  { command: "project", description: "Обсудить разработку" },
];

export async function verifyBot({ env = process.env, call } = {}) {
  if (
    !env.HTML_BOT_TOKEN ||
    !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(env.HTML_BOT_USERNAME || "")
  )
    throw new Error(
      "Set the NEW HTML_BOT_TOKEN and HTML_BOT_USERNAME without @",
    );
  const request =
    call ||
    ((method, payload) => telegramCall(env.HTML_BOT_TOKEN, method, payload));
  const me = await request("getMe", {});
  if (
    !me.is_bot ||
    me.username?.toLowerCase() !== env.HTML_BOT_USERNAME.toLowerCase()
  )
    throw new Error("Bot identity mismatch; no bot settings changed");
  return request;
}

export async function configureBot({ env = process.env, call } = {}) {
  let url;
  try {
    url = new URL(env.HTML_PUBLIC_URL);
  } catch {
    throw new Error("Set HTML_PUBLIC_URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("HTML_PUBLIC_URL must be a root HTTPS URL");
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.HTML_WEBHOOK_SECRET || ""))
    throw new Error(
      "Set HTML_WEBHOOK_SECRET: 32–256 characters A–Z, a–z, 0–9, _ or -",
    );
  const request = await verifyBot({ env, call });
  const webhookUrl = `${url.origin}/api/telegram`;
  const current = await request("getWebhookInfo", {});
  if (current.url && current.url !== webhookUrl)
    throw new Error(
      "This bot already has a different webhook; no settings changed",
    );
  await request("setMyCommands", { commands });
  await request("setChatMenuButton", { menu_button: { type: "commands" } });
  await request("setWebhook", {
    url: webhookUrl,
    secret_token: env.HTML_WEBHOOK_SECRET,
    allowed_updates: ["message", "widget_query"],
    drop_pending_updates: false,
  });
  return { configured: true };
}
