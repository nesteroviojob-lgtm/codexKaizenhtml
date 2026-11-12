import { telegramCall } from "./telegram.mjs";
import { widgetPayload } from "./widgets.mjs";
import {
  services,
  parseBriefRequest,
  briefPrompt,
  readPrompt,
  privacyConfig,
  leadsReady,
  validDescription,
  leadMessage,
} from "./brief.mjs";

export function createBotHandler({
  env = process.env,
  call,
  now = Date.now,
} = {}) {
  const request =
    call ||
    ((method, payload) => telegramCall(env.HTML_BOT_TOKEN, method, payload));
  const receipts = new Map();
  const rates = new Map();
  return async function handle(update) {
    const time = now();
    for (const [key, value] of receipts)
      if (value.expires <= time) receipts.delete(key);
    for (const [key, value] of rates)
      if (value.expires <= time) rates.delete(key);
    let receipt = receipts.get(update.update_id);
    if (!receipt) {
      if (receipts.size >= 10000) throw new Error("busy");
      receipt = { expires: time + 3600000, effects: new Map() };
      receipts.set(update.update_id, receipt);
    }
    if (receipt.complete) return;
    if (receipt.running) return receipt.running;
    // Keep successful effects on a partial retry, e.g. a delivered lead whose
    // confirmation failed. This is bounded in-process deduplication, not a queue.
    const effect = async (key, method, payload) => {
      if (!receipt.effects.has(key))
        receipt.effects.set(
          key,
          Promise.resolve().then(() => request(method, payload)),
        );
      try {
        return await receipt.effects.get(key);
      } catch (error) {
        receipt.effects.delete(key);
        throw error;
      }
    };
    const text = (chatId, content, extra = {}) => ({
      chat_id: chatId,
      text: content,
      link_preview_options: { is_disabled: true },
      ...extra,
    });
    const sendWidget = async (kind, chatId, service) => {
      try {
        await effect(
          "widget",
          "sendWidget",
          widgetPayload(kind, chatId, env, service),
        );
        return true;
      } catch (error) {
        if (!error.unsupportedWidget) throw error;
        await effect(
          "unsupported",
          "sendMessage",
          text(
            chatId,
            "Этот сервер Telegram пока не поддерживает HTML-виджеты. Повторите /start позже. Заявка не отправлена.",
          ),
        );
        return false;
      }
    };
    const prompt = async (chatId, selection) =>
      effect(
        "prompt",
        "sendMessage",
        text(chatId, briefPrompt(selection, privacyConfig(env)), {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "Задача и контакт для связи",
            selective: true,
          },
        }),
      );
    receipt.running = (async () => {
      const query = update.widget_query;
      if (query) {
        if (typeof query.id !== "string" || query.id.length > 256) return;
        const answer = async (message) => {
          try {
            await effect("answer", "answerWidgetQuery", {
              widget_query_id: query.id,
              data: JSON.stringify({ message }),
            });
          } catch (error) {
            if (error.code !== 400) throw error;
          } // An expired query cannot be answered again.
        };
        if (
          query.type?.type !== "data" ||
          query.chat?.type !== "private" ||
          !Number.isSafeInteger(query.from?.id) ||
          query.from.id <= 0 ||
          query.from.is_bot ||
          query.chat.id !== query.from.id ||
          !Number.isSafeInteger(query.message_id) ||
          query.message_id <= 0 ||
          typeof query.data !== "string" ||
          Buffer.byteLength(query.data) > 64
        ) {
          await answer("Откройте личный чат с ботом и отправьте /start.");
          return;
        }
        const project = /^project:([a-z]+)$/.exec(query.data);
        if (project && Object.hasOwn(services, project[1])) {
          const sent = await sendWidget("brief", query.chat.id, project[1]);
          await answer(
            sent
              ? "Бриф появился ниже в чате."
              : "Виджеты временно недоступны. Повторите позже.",
          );
          return;
        }
        const selection = parseBriefRequest(query.data);
        if (!selection) {
          await answer("Не удалось прочитать выбор. Начните заново: /project.");
          return;
        }
        if (!leadsReady(env)) {
          await answer("Приём заявок пока не подключён. Данные не отправлены.");
          return;
        }
        await prompt(query.chat.id, selection);
        await answer(
          "Ответьте на сообщение ниже: опишите задачу и оставьте контакт.",
        );
        return;
      }
      const message = update.message;
      if (
        message?.chat?.type !== "private" ||
        !Number.isSafeInteger(message.from?.id) ||
        message.from.id <= 0 ||
        message.from.is_bot ||
        message.from.id !== message.chat.id ||
        !Number.isSafeInteger(message.message_id) ||
        message.message_id <= 0
      )
        return;
      const chatId = message.chat.id;
      const command =
        typeof message.text === "string"
          ? message.text.split(/\s/)[0].split("@")[0]
          : "";
      if (command === "/project") {
        await sendWidget("brief", chatId, "unsure");
        return;
      }
      if (command === "/start" || command === "/cancel") {
        await sendWidget("home", chatId);
        return;
      }
      const selection = readPrompt(message, env, time);
      if (selection) {
        if (!leadsReady(env)) {
          await effect(
            "not-ready",
            "sendMessage",
            text(
              chatId,
              "Приём заявок временно недоступен. Данные команде не отправлены.",
            ),
          );
          return;
        }
        const hasUsername = /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(
          message.from.username || "",
        );
        const hasContact =
          typeof message.text === "string" &&
          (/[\w.+-]+@[^\s@]+\.[^\s@]+/.test(message.text) ||
            /\+?\d[\d ()-]{8,}\d/.test(message.text));
        if (!validDescription(message.text) || (!hasUsername && !hasContact)) {
          await effect(
            "validation",
            "sendMessage",
            text(
              chatId,
              "Нужно описание от 10 до 1600 символов. Если у вас нет @username, добавьте телефон или email. Заявка ещё не отправлена.",
            ),
          );
          await prompt(chatId, selection);
          return;
        }
        const rate = rates.get(chatId) || { count: 0, expires: time + 600000 };
        if (
          !receipt.counted &&
          (rate.count >= 5 || (!rates.has(chatId) && rates.size >= 10000))
        ) {
          await effect(
            "rate",
            "sendMessage",
            text(
              chatId,
              "Слишком много заявок. Подождите 10 минут, затем начните заново: /project.",
            ),
          );
          return;
        }
        if (!receipt.counted) {
          rate.count++;
          rates.set(chatId, rate);
          receipt.counted = true;
        }
        const lead = leadMessage(selection, message);
        await effect("lead", "sendMessage", {
          chat_id: env.HTML_LEADS_CHAT_ID,
          text: lead.text,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
        await effect(
          "confirmation",
          "sendMessage",
          text(
            chatId,
            `Заявка передана команде KAIZEN. Свяжемся по вашему Telegram-контакту или контакту из описания.\n\nНомер: ${lead.reference}\nНовый проект — /project.`,
          ),
        );
        return;
      }
      const help = message.reply_to_message
        ? "Этот бриф устарел или уже изменился. Начните новый командой /project. Заявка не отправлена."
        : "Посмотрите услуги и кейсы: /start. Чтобы обсудить разработку, отправьте /project и пройдите короткий бриф.";
      await effect("help", "sendMessage", text(chatId, help));
    })();
    try {
      await receipt.running;
      receipt.complete = true;
    } finally {
      receipt.running = null;
    }
  };
}
