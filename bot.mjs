import { telegramCall } from "./lib/telegram.mjs";
import { createBotHandler } from "./lib/bot.mjs";
import { verifyBot, commands } from "./lib/setup.mjs";

const env = process.env;
const call = (method, payload, options) =>
  telegramCall(env.HTML_BOT_TOKEN, method, payload, options);
const handle = createBotHandler({ env, call });
let stopped = false,
  offset = 0;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true;
  });
try {
  await verifyBot({ env, call });
  const info = await call("getWebhookInfo", {});
  if (info.url) throw new Error("Webhook already set");
  await call("setMyCommands", { commands });
  await call("setChatMenuButton", { menu_button: { type: "commands" } });
} catch {
  console.error(
    "Не удалось запустить НОВОГО бота: проверьте HTML_BOT_TOKEN, HTML_BOT_USERNAME и отсутствие webhook. Настройки webhook не изменены.",
  );
  process.exit(1);
}
console.log("KAIZEN HTML bot: polling started. No credentials are logged.");
while (!stopped) {
  try {
    const updates = await call(
      "getUpdates",
      { offset, timeout: 25, allowed_updates: ["message", "widget_query"] },
      { timeout: 35000 },
    );
    for (const update of updates) {
      await handle(update);
      offset = update.update_id + 1;
    }
  } catch {
    console.error("Telegram временно недоступен. Повтор через 5 секунд.");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
